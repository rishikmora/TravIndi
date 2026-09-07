# Recommended Implementation Order — Phase 6 onward

Status: **DESIGNED**. Phases 1–5 (this directory) are complete. This is the
recommended order for Phase 6–22 per the governing workflow, adapted to the frozen P0
slice in [04-feature-priority-matrix.md](04-feature-priority-matrix.md) and
[05-traceability-matrix-mvp.md](05-traceability-matrix-mvp.md). Nothing below has
started yet.

| Phase | Scope | Key open decisions to resolve first |
|---|---|---|
| 6. Repository / project structure — **DONE 2026-09-07** | `backend/` (FastAPI skeleton, 14 domain-module packages mirroring the schema plan, health check verified via pytest, ruff-clean), `mobile/` + `web/` (documented placeholders, real scaffolding deferred to Phase 11 since there's no API yet to build against), `infra/` (Docker Compose: Postgres+PostGIS+pgvector via custom Dockerfile, Redis, MinIO always-on; Keycloak+Kong behind a `full` profile for Phase 9+), git initialized (not yet committed — no commit has been made without an explicit request) | Cloud provider not yet chosen — not needed yet; Docker Compose is sufficient |
| 7. Database migrations & seed strategy | Implement the confirmed 14-schema plan ([09-database-schema-plan.md](09-database-schema-plan.md)) using SQLAlchemy 2.0 (async) + Alembic + GeoAlchemy2 + pgvector-sqlalchemy; author real `CREATE TABLE` DDL (source docs are conceptual only — see [Architecture Audit Part 2 item 8](06-architecture-audit-and-gaps.md)); add the CANCELLED/FALSE_ALARM SOS states; apply RLS to the 5 confirmed high-sensitivity tables only | None blocking — schema plan and tooling confirmed |
| 8. API contracts | OpenAPI spec for the P0 endpoint set only (Traceability Matrix); canonical paths per Conflict Register §4/§5 | None blocking |
| 9. Authentication / authorization | Keycloak realm setup, RBAC/ABAC roles, OPA policies | Role-permission matrix confirmed — see [08-role-permission-matrix.md](08-role-permission-matrix.md). Trusted-contact token flow (§1 of that doc) adds one table + one endpoint to Phase 14 scope. |
| 10. Backend foundations | Auth & Users, Tourism, Travel modules; FastAPI app skeleton with the module boundaries from Master Model §J | Depends on 7, 8, 9 |
| 11. Frontend foundations | React Native app shell (auth, destination discovery, trip screens); Next.js PWA shell | Depends on 8, 9 |
| 12. AI / RAG | AI Gateway, Model Router, planner agent, RAG over seeded tourism knowledge | **Pick RAG library** ([Assumption C2](03-assumption-register.md)) — surface to user before committing |
| 13. GIS / navigation | PostGIS setup, H3 aggregation, safe-route cost function (5-term, incl. emergency proximity per Conflict Register §8), routing engine integration | **Pick routing engine** ([Assumption C1](03-assumption-register.md)) — surface to user before committing |
| 14. Safety / SOS | SOS lifecycle, trusted contacts, emergency module, WebSocket `/ws/sos/{id}` | Depends on 9, 10 |
| 15. Offline synchronization | SQLite local store, sync queue, connectivity manager, idempotent `/api/v1/sync` | Depends on 10, 14 |
| 16. Authority dashboard | Next.js command center, `/ws/authority/{id}`, role-scoped views | Depends on 9, 14 |
| 17. Observability | OpenTelemetry, Prometheus/Grafana, Loki, trace correlation across the whole P0 slice | Depends on 10–16 being in place to instrument |
| 18. Tests | Unit, integration, contract, E2E (the core demo journey), load (k6), security, AI eval, offline sync, failure/recovery, migration tests | Provisional NFR placeholders ([Assumption C3](03-assumption-register.md)) used only for automated test thresholds, never reported as verified NFR compliance |
| 19. Security review | OWASP checks, dependency/secrets scanning, RLS boundary tests, rate-limit tuning from Conflict Register §11's provisional numbers | None blocking |
| 20. NFR / load evaluation | Run load tests, **measure** real p50/p95/p99, capacity ceilings, SOS ack latency, reconnect time — this is where NFR's deferred numbers actually get frozen | **User checkpoint: present measured numbers before calling any NFR "met"** |
| 21. Fix defects | — | — |
| 22. Final consistency audit | Re-run the Part 3 audit in [06-architecture-audit-and-gaps.md](06-architecture-audit-and-gaps.md) against the as-built system | — |

## User checkpoints (do not proceed past these without explicit confirmation)

1. ~~Before Phase 7 — confirm the reconciled 14-schema database plan~~ **Done 2026-09-07** — see [09-database-schema-plan.md](09-database-schema-plan.md).
2. ~~Before Phase 9 — confirm the role-permission matrix~~ **Done 2026-09-07** — see [08-role-permission-matrix.md](08-role-permission-matrix.md).
3. **Before Phase 12/13** — confirm RAG library and routing-engine picks (or override
   with a preference).
4. **Before Phase 20 sign-off** — present actually-measured NFR numbers; do not let
   provisional placeholders quietly become "the spec."

## What is explicitly NOT being built in this pass

Every P1/P2/P3 item in [04-feature-priority-matrix.md](04-feature-priority-matrix.md) —
including crowd forecasting ML, multilingual voice, business/guide verification,
IoT/MQTT ingestion, ticketing/booking/payments, and everything in Regional/National
scope (Kafka, Kubernetes, ClickHouse, digital twin, national knowledge graph). These
remain fully catalogued and staged, not deleted, per the no-silent-change rule.
