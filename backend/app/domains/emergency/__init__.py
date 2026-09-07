"""Emergency domain — sos_requests, sos_events, emergency_resources,
resource_assignments. Owns the `emergency` DB schema.

P0 — the platform's highest-criticality path. Implemented starting Phase 14.
State machine: CREATED -> ACKNOWLEDGED -> AUTHORITY_NOTIFIED -> RESOURCE_ASSIGNED ->
RESPONDER_ARRIVED -> RESOLVED, plus CANCELLED / FALSE_ALARM
(docs/00-planning/09-database-schema-plan.md §3). Row-Level Security is enabled on
`sos_requests`.
"""
