"""Adaptive journey engine — real event detection (CROWD_CHANGE,
SAFETY_CHANGE/INCIDENT_IMPACT) -> impact assessment -> AI-assisted
replan proposal -> deterministic validation -> user accept/reject ->
new itinerary version. See `app/domains/adaptation/detection.py` and
`app/domains/adaptation/service.py` for the two halves of the pipeline,
and `app/domains/travel/planner.py`'s `build_adaptation_proposal_changes`/
`apply_adaptation_proposal` for how it converges with the existing
manual-replan pipeline instead of duplicating it.

Scoped down from a much larger spec: no Kafka/dedicated worker service (a
FastAPI `BackgroundTask` reacting to a real `safety.Incident` report, plus
one manual REST check for crowd data, cover the two real trigger points
honestly), no circuit breakers/outbox pattern (direct commit-then-publish
matches every existing precedent in this codebase), no weather/transport/
availability adapters (no real source exists), no auto-apply-without-
approval path (every system-triggered adaptation is propose-only).
"""
