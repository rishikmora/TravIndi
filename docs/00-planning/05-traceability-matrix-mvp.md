# Traceability Matrix — Frozen MVP (P0) Slice

Status: **DESIGNED**. Feature → Functional Requirement → System Component → API →
Database Entity → Technology → Security Requirement → NFR → Test Case, for the P0
vertical slice frozen in
[04-feature-priority-matrix.md](04-feature-priority-matrix.md). P1–P3 features are
intentionally not traced line-by-line here (see that document for why) — this matrix
exists to make the *actual build* auditable end to end.

Legend for the **DB Entity** column: schema names use the reconciled 14-schema
proposal from [Conflict Register §6](02-conflict-register.md) — treat as
`[ASSUMPTION]` until confirmed.

---

## 1. Account & Identity

| Field | Value |
|---|---|
| Feature | User registration, login, OTP, roles (FR Domain 01) |
| FR | `identity, tourism, travel FR-01` (User Management, 9 entries) |
| System component | Auth & Users module (System Design §2) |
| API | `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/otp/verify`, `POST /api/v1/auth/token/refresh`, `GET /api/v1/me` |
| DB entity | `identity.users`, `identity.user_profiles`, `identity.user_roles`, `identity.user_consents`, `identity.sessions` |
| Technology | Keycloak + OIDC/OAuth 2.1 (+MFA), FastAPI, PostgreSQL |
| Security requirement | Password/OTP never logged; MFA where required; RBAC/ABAC scopes issued at login; `id` never `email`/`phone` (explicit DB rule) |
| NFR | Core API p95 ≤ 300ms (normal domain API tier); availability ≥ 99.9% |
| Test case | Unit: OTP validation logic. Integration: Keycloak token issuance. E2E: register → login → authenticated `/me` call. Security: brute-force/rate-limit on `/auth/login`. |

## 2. AI Travel Planning

| Field | Value |
|---|---|
| Feature | AI travel agent, itinerary generation, dynamic replanning (FR Domain 02) |
| FR | FR-02 (AI Travel Planning, 13 entries) |
| System component | AI Planning module → AI Gateway → Model Router → Agents (Planner) → Tools + RAG |
| API | `POST /api/v1/ai/trip-plan`, `POST /api/v1/ai/itinerary/generate`, `POST /api/v1/ai/itinerary/replan`, `POST /api/v1/jobs` (for long-running plan generation) |
| DB entity | `travel.trips`, `travel.itineraries`, `travel.itinerary_items`, `knowledge.knowledge_chunks` (RAG retrieval), `knowledge.predictions` (model_version/confidence) |
| Technology | AI Gateway (model-agnostic), LlamaIndex/LangChain `[ASSUMPTION C2]`, pgvector, PostgreSQL |
| Security requirement | Tool calls scoped/authorized (no unrestricted agent DB access); structured-output schema validation before use; prompt-injection isolation on retrieved content |
| NFR | AI synchronous latency ≤ 5s (when predictable); groundedness/tool-success/unsafe-output rate = `TO BE MEASURED/FROZEN DURING PILOT` (NFR §C) |
| Test case | Unit: schema validation of structured AI output. Integration: RAG retrieval against seeded knowledge base. AI eval: groundedness/relevance on a benchmark set (MLflow). E2E: plan → replan on simulated crowd/weather change. |

## 3. Destination Discovery

| Field | Value |
|---|---|
| Feature | Destination search, attraction detail, safety/crowd/accessibility view (FR Domain 03) |
| FR | FR-03 (Destination Discovery, 10 entries) |
| System component | Tourism module |
| API | `GET /api/v1/destinations`, `GET /api/v1/destinations/{id}`, `GET /api/v1/destinations/{id}/attractions`, `GET /api/v1/destinations/{id}/safety`, `GET /api/v1/destinations/{id}/crowd` |
| DB entity | `tourism.destinations` (PostGIS geography column), `tourism.attractions`, `crowd.crowd_cells` |
| Technology | PostGIS, H3, FastAPI, Redis (cache) |
| Security requirement | Public read endpoints; no PII exposure in destination/attraction responses |
| NFR | Simple read API p95 ≤ 200ms; data freshness: destination operational content = hours-to-days band (NFR §8.1) |
| Test case | Integration: PostGIS nearest/bbox query correctness. Contract: OpenAPI schema conformance. Load: k6 read-heavy scenario. |

## 4. Safe-Route Navigation

| Field | Value |
|---|---|
| Feature | Safe / crowd-free / accessible route scoring (FR Domain 04 core) |
| FR | FR-04 (Smart Navigation, core subset of 16 entries) |
| System component | Spatial/GIS service (never the LLM — explicit rule, see Master Model §O) |
| API | `POST /api/v1/routes/safe`, `POST /api/v1/routes/crowd-free`, `POST /api/v1/routes/accessible`, `POST /api/v1/routes/emergency` (canonical paths per [Conflict Register §4](02-conflict-register.md)) |
| DB entity | `travel.routes` (cached geometry + scores), `tourism.destinations` (PostGIS), `crowd.crowd_cells` (H3) |
| Technology | PostGIS, H3, OSRM `[ASSUMPTION C1]`, MapLibre + OpenStreetMap (client rendering) |
| Security requirement | Route inputs validated (no injection via free-form origin/destination text); rate-limited to prevent routing-engine abuse |
| NFR | Safety/critical-path latency guidance (no hard number frozen); route response must include geometry + objective score + reasons + freshness + confidence (System Design §7, API Design §10) |
| Test case | Unit: 5-term safe-cost formula (incl. emergency proximity — [Conflict Register §8](02-conflict-register.md)). Integration: routing-engine service call. E2E: reroute triggered by a simulated crowd-density spike (core demo journey). |

## 5. Tourist Safety (SOS + Trusted Contacts)

| Field | Value |
|---|---|
| Feature | One-tap SOS, trusted contacts, safety check-ins (FR Domain 05) |
| FR | FR-05 (Tourist Safety, 17 entries) |
| System component | Safety module → Emergency module (Communication for offline path) |
| API | `POST /api/v1/sos` (Idempotency-Key required), `GET /api/v1/sos/{id}`, `POST /api/v1/sos/{id}/cancel`, `WS /ws/sos/{id}` |
| DB entity | `emergency.sos_requests` (current state), `emergency.response_events`/`sos_events` (history — naming to reconcile per DB extraction §18.2), `identity.user_consents` (emergency data access) |
| Technology | PostgreSQL (authoritative), Redis (hot state), WebSockets, SQLite (mobile local ack) |
| Security requirement | Emergency authorization model: tourist → own SOS; trusted contact → limited status/location; police/ambulance/authority → scoped access by role+geography+assignment |
| NFR | SOS ack latency = `TO BE MEASURED/FROZEN` — but **local acknowledgement before cloud delivery is a hard MVP requirement regardless of the numeric target** (NFR §5, Tech Stack, System Design all agree) |
| Test case | Integration: idempotent repeated `POST /sos` creates exactly one record. Offline test: airplane-mode SOS creation → local ack → queued sync → server ack on reconnect. Security: cross-role access-scope test (tourist cannot read another tourist's SOS). |

## 6. Emergency & Incident Management

| Field | Value |
|---|---|
| Feature | Incident reporting, triage, dispatch, resolution (FR Domains 06, 20) |
| FR | FR-06 (Emergency Management, 15 entries), FR-20 (Incident Management, 20 entries) |
| System component | Emergency module, Policy engine (OPA), Human-in-the-loop workflow |
| API | `POST /api/v1/emergency/incidents`, `POST /api/v1/emergency/incidents/{id}/assign`, `.../escalate`, `.../resolve` (canonical path per [Conflict Register §5](02-conflict-register.md)) |
| DB entity | `safety.incidents` (current state), `safety.incident_events` (history), `emergency.emergency_resources`, `emergency.resource_assignments` |
| Technology | FastAPI, PostGIS (nearest resource), OPA, WebSockets (`/ws/authority/{id}`) |
| Security requirement | High-impact actions (dispatch, escalation) pass through OPA policy gate; every transition creates an audit event, never relies solely on a status column |
| NFR | Every lifecycle transition auditable (NFR "Definition of done"); dispatch latency = `TO BE MEASURED/FROZEN` |
| Test case | State-machine test: `CREATED → ACKNOWLEDGED → AUTHORITY_NOTIFIED → RESOURCE_ASSIGNED → RESPONDER_ARRIVED → RESOLVED`, no illegal transitions. E2E: full demo-journey SOS→authority-response chain. |

## 7. Offline Resilience

| Field | Value |
|---|---|
| Feature | Local queue, offline SOS acknowledgement, authenticated sync (FR Domain 07 core) |
| FR | FR-07 (Offline & Emergency Communication, core subset of 12 entries) |
| System component | Communication/offline-sync module |
| API | `POST /api/v1/sync` (body carries `operation_id` per operation, Idempotency-Key at the request level) |
| DB entity | Mobile-local: SQLite (outside PostgreSQL); server-side: whichever table the synced `entity_type` targets (e.g. `emergency.sos_requests`, `safety.incidents`) |
| Technology | SQLite, connectivity manager, PostgreSQL (idempotent commit) |
| Security requirement | Encrypt sensitive local data at rest on-device; sync requests authenticated (no anonymous sync) |
| NFR | Offline queue capacity/max age/retry backoff/conflict-resolution SLA = `TO BE MEASURED/FROZEN` (NFR §5); qualitative requirement (hard, not deferred): SOS gets local ack before cloud delivery succeeds |
| Test case | Offline/recovery test: create N operations offline, verify zero duplicates and correct ordering on reconnect. Conflict test: stale client version vs. server version → 409 handling. |

## 8. Crowd Awareness (minimal, feeding safe-route scoring)

| Field | Value |
|---|---|
| Feature | Live crowd/risk view sufficient to score routes and destination safety (FR Domain 08 core subset) |
| FR | FR-08 (Crowd Management, core subset of 16 entries) |
| System component | Crowd module |
| API | `GET /api/v1/crowd/heatmap`, `GET /api/v1/crowd/risk`, `WS /ws/destination/{id}` |
| DB entity | `crowd.crowd_cells` (H3-indexed), `crowd.observations` |
| Technology | PostGIS + H3, Redis (live state), XGBoost/LightGBM (P1 forecasting, not required for P0 minimal view) |
| Security requirement | Aggregate via H3 cells for analytics; do not expose individual tourist trails (privacy minimization rule, NFR §6.1) |
| NFR | Freshness band: crowd state = seconds-to-minutes (NFR §8.1) |
| Test case | Integration: H3 aggregation correctness. Contract: `crowd.updated` WS event includes required envelope fields (`event_id`/`sequence`/`version` — [Conflict Register §10](02-conflict-register.md)). |

## 9. Notifications

| Field | Value |
|---|---|
| Feature | Priority-aware delivery of SOS/crowd/incident alerts (FR Domain 36) |
| FR | FR-36 (Notifications & Alerts, 12 entries) |
| System component | Communication module, Notification router |
| API | `GET/POST /api/v1/notifications`, `/api/v1/notifications/preferences` |
| DB entity | (schema TBD in reconciled model — likely `governance` or a dedicated `notification` schema) `notification_preferences`, `notifications`, `notification_deliveries` |
| Technology | FCM + APNs, SMS provider `[ASSUMPTION C6]`, priority queue + retry |
| Security requirement | Escalation ladder respects role/consent scoping (trusted contact only receives what they're authorized to see) |
| NFR | Escalation ladder (hard requirement, not deferred): `INFO→push \| WARNING→push \| URGENT→push+SMS \| CRITICAL→push→SMS→trusted contact→authority` with retry+acknowledgement+audit |
| Test case | Integration: escalation ladder fires correct channel sequence for each priority. Failure test: notification provider outage → multi-channel fallback. |

## 10. Government / Authority Intelligence

| Field | Value |
|---|---|
| Feature | Live map, SOS/incident monitoring, resource tracking (FR Domain 32) |
| FR | FR-32 (Government Intelligence, 18 entries) |
| System component | Authority command center (Next.js) → Analytics/Interoperability modules |
| API | `GET /api/v1/authority/dashboard`, `WS /ws/authority/{id}` (explicitly named P0 in API Design's MVP set) |
| DB entity | Read-heavy views over `safety.incidents`, `emergency.sos_requests`, `crowd.crowd_cells` |
| Technology | Next.js, WebSockets, GIS dashboard components, RBAC/ABAC role-scoped views |
| Security requirement | Role-aware views; scoped to assigned geography/function per the RLS boundary rule; every operational action from this dashboard is audit-logged |
| NFR | Realtime event delivery p95 and reconnect time = `TO BE MEASURED/FROZEN`; this is explicitly the P0 realtime consumer that motivates building WebSockets in MVP at all |
| Test case | E2E: authority operator sees a new SOS appear live without page refresh. Security: operator cannot view/act outside their assigned scope. |

## 11. Accessibility Overlay (cross-cutting, P0 on critical flows only)

| Field | Value |
|---|---|
| Feature | Screen-reader/scalable-text/non-visual access on SOS, navigation, emergency instructions (FR Domain 22, core subset) |
| FR | FR-22 (Accessibility, core subset of 17 entries) |
| System component | Client layer (mobile + PWA), applies across all P0 features above |
| API | N/A — a client/UX requirement, not a distinct API surface |
| DB entity | `identity.user_profiles.accessibility_preferences` (JSONB) |
| Technology | React Native / Next.js accessibility APIs |
| Security requirement | N/A |
| NFR | Conformance target = `[ASSUMPTION C4]` WCAG 2.1 AA on critical flows; NFR: "Accessibility failures affecting SOS, navigation or emergency instructions are P0 defects" |
| Test case | Manual + automated screen-reader/text-scaling test on SOS creation and safe-route flows specifically (not the whole app, for MVP scope). |

## 12. Cross-cutting: Privacy & Security (applies to every row above)

| Field | Value |
|---|---|
| Feature | Consent management, data minimization, RBAC/ABAC/OPA, encryption, audit | 
| FR | FR-37 (Privacy & Trust), FR-42 (Security) |
| System component | Trust/Governance layer (shared by all modules) |
| API | `GET/POST /api/v1/users/me/consents`, `DELETE /api/v1/users/me/consents/{id}` |
| DB entity | `identity.user_consents`, `governance.audit_logs`, `governance.policies` |
| Technology | Keycloak, OPA, Vault/managed secrets, TLS, PostgreSQL RLS |
| Security requirement | This *is* the security requirement column for every other row — separate credential models for user/service/device/provider identity (Master Model §M) |
| NFR | Security and Privacy are **P0 at every deployment stage including SIH MVP** per NFR's own priority-by-scale matrix — the only two domains with that unconditional status alongside SOS/core-API/offline/AI-quality |
| Test case | Security review (Phase 19): OWASP checks, dependency scanning, secrets scanning, abuse tests, RLS boundary tests across every module above. |

---

*Next: [06-architecture-audit-and-gaps.md](06-architecture-audit-and-gaps.md).*
