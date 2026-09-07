# Database Schema Plan — CONFIRMED

Status: **DESIGNED — confirmed by user on 2026-09-07** (resolves
[Conflict Register §6](02-conflict-register.md) and folds in items 1–5, 9, 11–12 of the
Database Design extraction's internal-contradiction list, [Architecture Audit Part 3](06-architecture-audit-and-gaps.md)).

The source Database Design document is conceptual, not a DDL script, and its own
"Revised" and "Baseline" sections disagree with each other on schema count, table
naming, and even a scoring formula (full detail: Conflict Register §6, §8). This plan
is the reconciled version to actually build from in Phase 7. Every resolution below
follows the same rule used throughout this planning set: prefer whichever source
version is more complete, corroborated by other documents, or internally consistent;
where the documents are silent, say so and propose a default.

---

## 1. Schema boundaries — 14 schemas confirmed

| Schema | Owns | Source basis |
|---|---|---|
| `identity` | users, profiles, roles, consents, devices, sessions, trusted-contact tokens | Baseline + Revised agree; extended per [08-role-permission-matrix.md](08-role-permission-matrix.md) |
| `tourism` | destinations, attractions, events, facilities | Baseline + Revised agree |
| `travel` | trips, itineraries, itinerary_items, routes | Baseline + Revised agree |
| `safety` | risk_zones, safe_zones, safety_scores, incidents, incident_events, incident_evidence | Baseline's split (kept separate from `emergency` — see §3 below) |
| `emergency` | sos_requests, sos_events, emergency_resources, resource_assignments | Baseline's split |
| `crowd` | crowd_cells, observations, crowd_predictions, crowd_events, IoT device/measurement tables (folded in for MVP — confirmed §5) | Baseline, extended |
| `business` | businesses, business_profiles, guides, services, offers, availability | Baseline + Revised agree |
| `booking` | bookings, tickets, availability_slots | Baseline + Revised agree (P1, not P0 — see feature priority matrix) |
| `payment` | payments, refunds, payment_events, webhooks | Baseline + Revised agree (P1) |
| `trust` | verifications, credentials, reviews, review_analysis, fraud_cases, fraud_signals, fraud_evidence | Baseline + Revised's intentional additions (Revision Delta confirms `fraud_evidence`/`review_verification` are new, not renames) |
| `knowledge` | knowledge_sources, knowledge_documents, knowledge_chunks, knowledge_versions, ai_sessions, ai_messages, ai_tool_calls, ai_responses, ai_predictions, recommendations | **New schema** — neither source version gives AI/RAG a schema home despite detailing 11 tables for it |
| `analytics` | aggregates, KPI snapshots, feature tables | Baseline only — no field-level detail exists anywhere; built out as needed post-MVP |
| `integration` | providers, external_mappings, webhook_events | Baseline only |
| `governance` | policies, audit_logs, retention_rules | Baseline only |

**Why 14, not 8 (Revised) or 13 (Baseline):** the Revised grouping is too coarse to
implement directly (it merges `safety`+`emergency`, drops `analytics`/`integration`/
`governance` entirely, and gives AI/RAG no home at all). The Baseline's 13 schemas are
more complete but still miss AI/RAG. This plan takes the more complete Baseline
structure and adds the one schema neither version actually provides.

## 2. Table-name reconciliations (Revised vs. Baseline conflicts, resolved)

| Conflict (from DB extraction §18) | Resolution |
|---|---|
| `itinerary_items` — Revised gives a generic `item_type` + "structured target refs"; Baseline gives a narrower attraction-only field list, even though prose elsewhere requires supporting attractions/hotels/events/restaurants/experiences/transport | **Polymorphic reference**: `item_type` enum + nullable `attraction_id`/`business_id`/`event_id`/`route_id` FKs (only the one matching `item_type` is populated) + `sequence`, `scheduled_time`, `cost`, `transport_mode` + `reason_code`, `explanation`, `score_snapshot` (JSONB) columns embedded directly on the row — not a separate table, since it's a 1:1 relationship with each item |
| SOS/incident history-table naming (`sos_events`/`incident_events` [Baseline] vs. `response_events` [Revised]) | Use Baseline's names — `emergency.sos_events` and `safety.incident_events` — since they pair directly and unambiguously with their current-state tables (`sos_requests`, `incidents`). Keep Revised's `resource_assignments` and `incident_evidence` as **additional** tables (the Revision Delta explicitly names these as new capabilities, not renames of the history tables) |
| `predictions` used ambiguously in both the crowd domain and the AI domain | Two distinct tables: `crowd.crowd_predictions` (density/risk forecasts, XGBoost/LightGBM) and `knowledge.ai_predictions` (general model output metadata: type, target, value, confidence, model_version, valid_until) |
| `sessions` used unqualified in both Identity and AI/Knowledge domain boxes | Two distinct tables: `identity.sessions` (auth/login sessions) and `knowledge.ai_sessions` (AI conversation context) |
| `assignments` (Revised domain box) vs. `resource_assignments` (Revised detail page) | Standardize on `emergency.resource_assignments` |
| Orphan names from the Baseline partitioning list with no schema/field home anywhere (`crowd_observations`, `iot_measurements`, `location_events`, `ml_predictions`) | `crowd_observations` → same table as `crowd.observations` (naming standardized); `iot_measurements` → `crowd.iot_measurements` (schema placement confirmed §5); `location_events` → `crowd.location_events` (raw, short-retention GPS ingestion per NFR §8.1's "short retention" rule); `ml_predictions` → covered by the `crowd_predictions`/`ai_predictions` split above, no separate table needed |
| Safe-route cost function 4-term vs. 5-term | Already resolved in [Conflict Register §8](02-conflict-register.md) — 5-term formula, including `− emergency_weight · emergency_proximity` |

## 3. Genuine design additions (not sourced — new, needed to close real gaps)

- **Emergency/SOS state machine failure states.** No source document defines anything
  beyond the happy path `CREATED → ACKNOWLEDGED → AUTHORITY_NOTIFIED →
  RESOURCE_ASSIGNED → RESPONDER_ARRIVED → RESOLVED`. Adding two states: **`CANCELLED`**
  (reachable from any non-terminal state — tourist or operator cancels) and
  **`FALSE_ALARM`** (terminal, set by an authority operator after review, distinct from
  `RESOLVED` for reporting accuracy). `[C]` — not sourced, needed for auditability
  ("Can we prove it?" — the DB Design document's own North Star question).
- **`retention_class` metadata column** on tables the NFR/DB documents call out for
  differentiated retention (raw location telemetry, crowd aggregates, media) — so
  retention policy can be enforced later via a scheduled job without a schema change,
  once actual numeric retention periods are frozen during pilot (NFR §10 — still
  explicitly deferred, not resolved by this plan).
- **`trusted_contact_access_tokens`** table in `identity` — per
  [08-role-permission-matrix.md §1](08-role-permission-matrix.md).

## 4. Conventions (confirmed, applied globally)

| Convention | Decision | Source |
|---|---|---|
| Primary keys | UUIDv7 (time-ordered) | Technology Stack: "UUID/UUIDv7-style IDs" — v7 chosen concretely for index locality |
| Money | `NUMERIC(12,2)` + `CHAR(3)` ISO-4217 currency code, never floating point | Explicit rule, both document versions |
| Time | `timestamptz`, UTC; destination-local timezone stored as a separate explicit column where display requires it | Explicit rule, Technology Stack §13 |
| Geospatial | PostGIS `geography` type (not `geometry`) for anything requiring real-world distance calculations; SRID documented per column | Explicit rule ("Document SRID and use geography vs geometry intentionally") |
| Soft delete | Only where business semantics require it (financial/audit/emergency records are never hard-deleted); everything else uses hard delete with FK `ON DELETE` policy decided per relationship | Explicit rule, Revised §13 |
| Current-state + history pairing | Every critical workflow (SOS, incidents, payments) gets a current-state table plus an append-only event table | Explicit rule, repeated across NFR/DB Design/API Design |

---

## 5. Decisions confirmed by user (2026-09-07)

| Fork | Decision |
|---|---|
| IoT schema placement | Fold IoT device/measurement tables into `crowd` schema for MVP (no dedicated `iot` schema yet — split out later if it grows) |
| RLS scope | RLS enabled only on `emergency.sos_requests`, `safety.incidents`, `identity.users`/`user_profiles`, `identity.trusted_contact_access_tokens`, as a defense-in-depth backstop behind OPA/application-layer authorization; every other table relies on the app layer |
| ORM / migration tooling | **SQLAlchemy 2.0 (async) + Alembic**, with GeoAlchemy2 (PostGIS) and pgvector-sqlalchemy (vector columns) |

These are now binding for Phase 7 (database migrations & seed strategy). The schema
plan in §1–4 above is final; Phase 7 authors the actual `CREATE TABLE` DDL from it.
