"""Durable job queue primitives — enqueue/claim/complete/fail against the
real `adaptation.adaptation_jobs` table (`models.AdaptationJob`; see its
docstring for why this replaces FastAPI `BackgroundTasks`). Claiming uses
Postgres `FOR UPDATE SKIP LOCKED`, real row-level locking, so it stays
correct even if more than one poller runs concurrently — though the single
in-process loop in `worker.py` is the only caller today.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.adaptation.models import AdaptationJob, AdaptationJobStatus

_LEASE_MINUTES = 5
"""How long a CLAIMED job is trusted to still be in progress. A worker
that crashes mid-job leaves its row CLAIMED forever unless something
reclaims it — past this lease, the next poll treats it as available
again, exactly like a fresh PENDING row. This is what makes the queue
survive a restart, not just a clean shutdown."""

_BACKOFF_BASE_MINUTES = 2
"""Exponential backoff on failure: 2, 4, 8, 16... minutes by attempt
number, so a persistently-failing job (e.g. the Anthropic credit outage)
doesn't get hammered every poll cycle."""


async def enqueue_job(session: AsyncSession, *, job_type: str, payload: dict) -> AdaptationJob:
    """Adds the row to the session — does NOT commit. Callers enqueue in
    the same transaction as the real event that motivated the job (e.g.
    `create_incident`'s own commit), so the two are atomically durable
    together: either both happened, or neither did."""
    job = AdaptationJob(job_type=job_type, payload=payload, run_after=datetime.now(UTC))
    session.add(job)
    await session.flush()
    return job


async def claim_next_job(session: AsyncSession, *, worker_id: str) -> AdaptationJob | None:
    """Atomically claims the oldest eligible job — a fresh PENDING row
    whose `run_after` has arrived, or a CLAIMED row whose lease has
    expired (a prior claimant crashed or was killed mid-job). Commits on
    its own: the claim itself must be durable immediately, independent of
    whatever the caller does with the job afterward."""
    lease_cutoff = datetime.now(UTC) - timedelta(minutes=_LEASE_MINUTES)
    result = await session.execute(
        text(
            """
            UPDATE adaptation.adaptation_jobs
            SET status = 'CLAIMED', locked_at = now(), locked_by = :worker_id,
                attempt_count = attempt_count + 1
            WHERE id = (
                SELECT id FROM adaptation.adaptation_jobs
                WHERE (status = 'PENDING' AND run_after <= now())
                   OR (status = 'CLAIMED' AND locked_at < :lease_cutoff)
                ORDER BY run_after
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id
            """
        ),
        {"worker_id": worker_id, "lease_cutoff": lease_cutoff},
    )
    row = result.first()
    await session.commit()
    if row is None:
        return None
    return await session.get(AdaptationJob, row.id)


async def mark_job_done(session: AsyncSession, job: AdaptationJob) -> None:
    job.status = AdaptationJobStatus.DONE
    await session.commit()


async def mark_job_failed(session: AsyncSession, job: AdaptationJob, *, error: str) -> None:
    """Permanently FAILED once `max_attempts` is reached (matching
    `AdaptationEvent`'s own FAILED status — never silently retried
    forever); otherwise back to PENDING with an exponential-backoff
    `run_after`, so the next poll leaves it alone until then."""
    job.last_error = error[:1024]
    if job.attempt_count >= job.max_attempts:
        job.status = AdaptationJobStatus.FAILED
    else:
        job.status = AdaptationJobStatus.PENDING
        backoff = timedelta(minutes=_BACKOFF_BASE_MINUTES * (2 ** (job.attempt_count - 1)))
        job.run_after = datetime.now(UTC) + backoff
    await session.commit()


def incident_impact_job_payload(incident_id: uuid.UUID) -> dict:
    return {"incident_id": str(incident_id)}
