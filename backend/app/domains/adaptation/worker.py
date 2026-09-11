"""The whole "worker" for this pass: one `asyncio.Task` polling
`adaptation.adaptation_jobs`, started from `app/main.py`'s lifespan and
cancelled on shutdown. It differs from the `BackgroundTasks` mechanism it
replaces only in *where the work order lives* — a committed DB row, not a
Python closure in process memory — which is exactly what survives a
restart. Deliberately not a separate worker service/process and not
Redis/Kafka-backed: a single in-process poller is the honest scope for
this deployment (one backend process, no multi-instance fanout), agreed
explicitly when this pass was scoped down from the full hardening spec.
"""

import asyncio
import contextlib
import logging
import socket
import uuid
from collections.abc import Awaitable, Callable

from app.db.session import get_session_factory
from app.domains.adaptation.detection import detect_incident_impact
from app.domains.adaptation.jobs import claim_next_job, mark_job_done, mark_job_failed
from app.domains.adaptation.models import AdaptationJob

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 3.0
_WORKER_ID = f"{socket.gethostname()}:{uuid.uuid4().hex[:8]}"

_JOB_HANDLERS: dict[str, Callable[[dict], Awaitable[None]]] = {
    "detect_incident_impact": lambda payload: detect_incident_impact(uuid.UUID(payload["incident_id"])),
}


async def _run_one_job(job: AdaptationJob) -> None:
    """`job` was claimed (and its claim-session closed) before this is
    called — it's a detached instance. Every status transition below
    re-fetches the row inside its own fresh session rather than mutating
    `job` directly and committing: mutating a detached object and
    committing a session that never had it added is a silent no-op (the
    commit has nothing to flush), which would leave real work reported
    done/failed only in this function's local memory, never in the
    database the next poll actually reads."""
    handler = _JOB_HANDLERS.get(job.job_type)
    job_id, job_type, payload = job.id, job.job_type, job.payload

    if handler is None:
        # Unknown job_type — a future job type enqueued by code this
        # worker version doesn't know about yet. Fails permanently
        # rather than retrying forever against a handler that will
        # never appear on its own.
        async with get_session_factory()() as tracking_session:
            job_row = await tracking_session.get(AdaptationJob, job_id)
            if job_row is not None:
                await mark_job_failed(tracking_session, job_row, error=f"no handler registered for job_type={job_type!r}")
        return

    try:
        await handler(payload)
    except Exception as exc:
        # Same fire-and-forget boundary as service.py's process_event:
        # a job handler failing (AI outage, a real bug) must never
        # kill the poll loop itself. Logged for real visibility,
        # retried with backoff up to max_attempts.
        logger.exception("adaptation job %s (%s) failed", job_id, job_type)
        async with get_session_factory()() as tracking_session:
            job_row = await tracking_session.get(AdaptationJob, job_id)
            if job_row is not None:
                await mark_job_failed(tracking_session, job_row, error=repr(exc))
        return

    async with get_session_factory()() as tracking_session:
        job_row = await tracking_session.get(AdaptationJob, job_id)
        if job_row is not None:
            await mark_job_done(tracking_session, job_row)


async def _poll_loop() -> None:
    while True:
        try:
            async with get_session_factory()() as claim_session:
                job = await claim_next_job(claim_session, worker_id=_WORKER_ID)
            if job is not None:
                await _run_one_job(job)
                continue  # drain the queue before sleeping again
        except Exception:
            # The poll loop itself must never die — a bad claim/DB blip
            # this iteration should not end background processing for
            # the rest of the process's lifetime.
            logger.exception("adaptation worker poll iteration failed")
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)


def start_worker() -> asyncio.Task:
    return asyncio.create_task(_poll_loop(), name="adaptation-job-worker")


async def stop_worker(task: asyncio.Task) -> None:
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
