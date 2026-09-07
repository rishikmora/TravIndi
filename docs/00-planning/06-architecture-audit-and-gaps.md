# Architecture Consistency Audit & Missing-Information Report

Status: **DESIGNED**.

## Part 1 — Consistency audit (where the documents agree strongly)

These are the load-bearing decisions that show up **identically or near-identically
across 3+ independent documents** — treat these as the highest-confidence, lowest-risk
parts of the whole spec, safe to build against without further confirmation:

| Decision | Confirmed by |
|---|---|
| FastAPI modular monolith for MVP (no microservices, no Kubernetes) | Technology Stack, System Design, API Design, Database Design |
| PostgreSQL + PostGIS + pgvector + Redis + S3/MinIO as the MVP data platform | All four architecture documents |
| Keycloak + OIDC/OAuth 2.1 + RBAC/ABAC + OPA | Technology Stack, System Design, API Design, NFR |
| "LLM never becomes irreversible emergency authority" / "AI recommends, policy decides, humans control high-impact actions" | Technology Stack, System Design, API Design, NFR — verbatim or near-verbatim in all four |
| "The LLM must not invent route geometry; routing is a spatial-engine computation" | System Design, API Design, Database Design |
| PostgreSQL is authoritative; Redis is reconstructable hot state; external providers never write directly to core tables | NFR, System Design, Database Design |
| Every critical write (booking/payment/SOS/sync) requires an Idempotency-Key | Technology Stack, System Design, API Design, Database Design, NFR |
| SOS gets local acknowledgement before cloud delivery succeeds | Technology Stack, System Design, API Design, NFR |
| BLE/Wi-Fi Direct peer relay is pilot-only, never an MVP guarantee | Technology Stack, System Design, API Design, Database Design |
| Kafka/Kubernetes/Flink/ClickHouse/digital twin are explicitly deferred past MVP | Technology Stack, System Design, API Design, Database Design, NFR |
| Clients stay thin — business rules, AI decisions, policy, audit live in the backend | Technology Stack, System Design |
| Deployment staging: SIH MVP (1-2 VMs) → Pilot (managed containers) → Regional (Kubernetes) → National (hybrid/edge) | Technology Stack, System Design, API Design, Database Design — identical table in all four |
| Provider-specific schemas must stay behind adapters, never leak into domain modules | System Design, API Design, Database Design |
| Recommended SIH demo journey: plan → crowd/safety change → reroute → offline SOS → reconnect → authority response | System Design (explicit), matches the governing instructions' required E2E test journey exactly |

This level of agreement across independently-authored documents is a strong positive
signal — the underlying architecture intent is coherent even though the documents
disagree on a number of second-order details (see Conflict Register).

## Part 2 — Missing-information report

Information the governing instructions ask for that **no source document actually
supplies**, beyond what's already captured in the Assumption Register:

1. **No formal SRS anywhere.** Both "requirements" documents (Feature Blueprint,
   Functional Requirements) are flat name-only catalogs — no acceptance criteria, no
   "the system shall," no measurable per-requirement test conditions. Every acceptance
   criterion used in the [Traceability Matrix](05-traceability-matrix-mvp.md) had to be
   derived from cross-referencing the architecture/API/DB/NFR documents, not read
   directly off a requirement.
2. **No role-permission matrix** (Assumption Register D1/D2) — the single biggest gap
   for near-term implementation, since it blocks concrete Keycloak/OPA configuration.
3. **No numeric NFR thresholds for capacity, AI quality, realtime, or disaster
   recovery** — the NFR document explicitly defers all of these to a pilot-freeze
   process that hasn't happened yet. This is not a document defect; it's a stated,
   deliberate scaffold. It does mean no "meets NFR X" claim can be made honestly until
   that freeze happens.
4. **No cloud provider named anywhere** — deliberate, per the stated
   no-hidden-cloud-dependency principle, but it does mean Phase 6 (repo/infra setup)
   needs an explicit choice from the user before any deployment work starts (local
   Docker Compose is sufficient for early implementation and doesn't require this
   decision yet).
5. **No vendor named for payments, SMS, or push notifications** — deferred by design
   (provider abstraction), but real vendor accounts will be needed before Phase 15/16
   can be tested end-to-end against a live provider rather than a mock.
6. **No problem statement / user research** in any of the 7 documents — everything here
   is solution-side. If SIH judging criteria or a separate problem-statement document
   exists, it hasn't been supplied to this session and should be requested if precise
   alignment matters.
7. **The Municipality adapter** (System Design's own diagram) has no accompanying
   specification anywhere — treated as out-of-scope for MVP (Assumption Register D3).
8. **No explicit data schemas (column-level types/constraints) for most tables** —
   the Database Design document is architectural/conceptual, not a DDL script. Full
   `CREATE TABLE` statements will need to be authored during Phase 7 as an engineering
   deliverable, informed by (but not copy-pasted from) the source document's field
   lists.

## Part 3 — Full list of in-document contradictions found (cross-reference)

All 20+ specific contradictions found during extraction are catalogued with
resolutions in [02-conflict-register.md](02-conflict-register.md). Lower-stakes ones
not significant enough for a dedicated register entry, listed here for completeness:

- Feature Blueprint: page-1 footer text differs from every other page's footer
  (cosmetic).
- Feature Blueprint: ~15+ near-duplicate feature names recur across different domains
  with no cross-reference (e.g. "AI route optimization" in both AI and Maps domains) —
  treat as intentional cross-domain reuse, not accidental duplication, unless a
  specific pair causes a real schema conflict.
- Functional Requirements: "User management" is both the name of Domain 01 and a leaf
  entry inside Domain 40 (Administration) — read as intentional (top-level identity
  concern vs. an admin-side management *action* on users), not a defect.
- API Design: error envelope's `details` field shown as `{}` in one place and
  `{"fields":[]}` in another — pick `{"fields": [...]}` as the canonical shape (more
  informative, and matches the "revised = implementation baseline" resolution rule
  used throughout).
- API Design: an `Idempotency-Key` header shown attached to a `GET` request in one
  example (nonsensical, since idempotency keys are for writes) — treat as an
  example-authoring error, not a rule to implement.
- Database Design: several table names (`crowd_observations`, `iot_measurements`,
  `location_events`, `ml_predictions`) appear once in a partitioning-candidates list
  with no schema/field definition anywhere else — treat as forward-looking placeholder
  names for P1/P2 tables, not MVP requirements.
- Database Design: the emergency-lifecycle state machine has no failure/cancel/
  false-alarm state anywhere — a real design gap to close during Phase 7 schema design
  (add `CANCELLED` / `FALSE_ALARM` states; not sourced from any document, so mark as
  `[ASSUMPTION]` when added).

---

*Next: [07-implementation-roadmap.md](07-implementation-roadmap.md).*
