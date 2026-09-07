# Project Master Model — SIH 26204

Status: **DESIGNED**. Synthesized from all 7 source documents (see [README](README.md)).
Every statement below is sourced; where the documents don't say something, it is marked
`[ASSUMPTION]` or `[GAP]` and cross-referenced into the
[Assumption Register](03-assumption-register.md).

---

## A. Product vision

An AI-powered smart travel & tourism platform for India that unifies trip planning,
destination discovery, crowd/safety-aware navigation, tourist safety and emergency
response, and government/authority operational intelligence into one coherent system.
North-star, stated near-identically across the System Design, Technology Stack and API
Design documents: **"Experience + AI + GIS + Real-time + Trust + Governance."** The NFR
document adds the quality-facing framing: **"Secure • Predictable • Measurable •
Offline-aware • Recoverable."**

## B. Problem being solved

Not stated explicitly as a "problem statement" in any of the 7 documents — all seven
are solution/architecture-side documents (SIH provides the problem statement
separately, outside this document set). Inferred from the shape of the feature set
(P0 slice: planning, discovery, safe routing, SOS, authority response) `[ASSUMPTION —
Category B, strongly implied]`: tourists in India lack a single trusted system for
planning trips, discovering destinations, navigating safely with real-time
crowd/safety awareness, and reaching help quickly in an emergency — while government
tourism/police/emergency authorities lack real-time situational intelligence and a
coordinated response channel to those tourists.

## C. Target users

Not enumerated as personas anywhere in the 7 documents beyond four account types (see D).
Implied by feature content: domestic and international tourists (including
accessibility-, senior-, child-, women-, and family-specific flows named throughout the
Feature Blueprint and FR catalogs), local guides, local businesses (hotels, restaurants,
transport, artisans), and government/authority operators (police, tourism department,
municipality, emergency services).

## D. User roles

**Explicitly named roles (only source: Functional Requirements, Domain 01 "User
Management"):** Tourist account, Guide account, Business account, Authority account.
**No permission matrix exists for any of these roles anywhere in the 7 documents** — a
significant, repeatedly-flagged gap (see [Conflict Register §7](02-conflict-register.md)
and [Assumption Register](03-assumption-register.md)).

The System Design and Feature Blueprint documents imply finer-grained authority
sub-personas via named dashboards — Police dashboard, Tourism authority dashboard,
Municipality dashboard, Business verification dashboard, Emergency-services dashboard —
but never state whether these are distinct roles or views within one "Authority"
role. Additionally, the API Design's OAuth scope list (`authority:incident:manage`,
`authority:resource:dispatch`, `verification:review`, etc.) implies scope-level
distinctions finer than the four account types. `[GAP — see Architecture Audit]`

Non-account-holding actors also referenced: **trusted contact** (has limited,
scoped access to a tourist's SOS status/location without being a full account type).

## E. Functional domains

Two independent, unreconciled domain taxonomies exist in the source set — this is the
single largest structural finding of this extraction (full detail in
[Conflict Register §1](02-conflict-register.md)):

- **Feature Blueprint**: 30 domains, 659 named capabilities (no descriptions/roles/priority)
- **Functional Requirements**: 42 domains, 565 named requirement entries (no
  IDs/acceptance-criteria/dependencies/priority beyond the 4 account types)

Per the source-priority hierarchy (FR ranks above Feature Blueprint), **the 42-domain
FR taxonomy is treated as authoritative for module/schema boundaries** throughout this
document set; the Feature Blueprint's 30-domain catalog is treated as a supplementary,
broader capability reference (particularly for its P3/visionary "Advanced / Future"
domain). See the full domain list and reconciliation notes in
[04-feature-priority-matrix.md](04-feature-priority-matrix.md).

## F. Complete feature inventory

659 (Blueprint) + 565 (FR) named items were extracted verbatim in the per-document
extraction passes that preceded this synthesis (full text preserved in this session's
subagent transcripts). Reproducing all 1,224 entries a second time here would not be
useful — instead:

- Domain-level counts and P0/P1/P2/P3 classification: [04-feature-priority-matrix.md](04-feature-priority-matrix.md)
- Full per-feature traceability for the **frozen MVP (P0) slice only**: [05-traceability-matrix-mvp.md](05-traceability-matrix-mvp.md)
- P1–P3 features remain catalogued at the domain level; they are **not deleted or
  silently dropped** — they are staged, per the no-silent-change rule.

## G. Functional requirements

The Functional Requirements document itself is **not a conventional SRS** — no FR-IDs,
no "the system shall" statements, no acceptance criteria, no stated dependencies. It is
a flat 42-domain / 565-entry capability-name catalog. This is stated by the document
itself: *"Wording and item order are preserved"* from an unspecified prior "complete
functional-requirements list." Where this document set needs FR-style semantics
(acceptance criteria, dependency edges), they are engineering derivations
`[ASSUMPTION — Category C]`, clearly labeled as such wherever they appear, never
presented as sourced fact.

## H. Non-functional requirements

Full detail: NFR extraction (this session). Summary: the NFR document is explicitly a
**scaffold**, not a numeric SLA sheet — by its own words, *"It does not rely on hidden
assumptions for unspecified numeric thresholds; those are explicitly marked for pilot
freeze."* Only 8 hard numbers exist in the entire 21-page document:

| Metric | Value |
|---|---|
| Core API availability | ≥ 99.9% (monthly, exclusion windows TBD) |
| Simple read API latency | p95 ≤ 200 ms |
| Normal domain API latency | p95 ≤ 300 ms |
| Safety/critical write latency | p95 ≤ 1 s (target) |
| AI synchronous latency | ≤ 5 s (when predictable) |
| Idempotent-operation duplicate rate | zero logical duplicates (target) |
| Stale-write conflict status | HTTP 409 Conflict |
| API version scheme | `/api/v1` |

Everything else — capacity limits, AI-quality thresholds (groundedness, unsupported-answer
rate, tool-success rate, unsafe-output rate), realtime event latency/reconnect/drop
tolerance, RPO/RTO, SOS acknowledgement latency, abuse/rate-limit thresholds — is
explicitly marked **"Define… before pilot freeze"** in the source. This document set
carries those forward as `TO BE MEASURED / FROZEN DURING PILOT`, per instruction, rather
than inventing numbers. Where provisional engineering targets are proposed for testing
purposes during MVP build, they are explicitly labeled as assumptions in the
[Assumption Register](03-assumption-register.md), never as frozen requirements.

Priority-by-scale matrix (NFR document, verbatim): Security, Privacy, SOS/Emergency,
Core API performance, Offline resilience, and AI quality are **P0 at every stage
including SIH MVP**. Kafka/stream processing, multi-region, and digital twin are **P2
until Regional/National scale.**

## I. Technology stack

Confirmed consistently across Technology Stack, System Design, API Design and Database
Design documents (high agreement — see [Architecture Audit](06-architecture-audit-and-gaps.md)):

| Layer | MVP choice | Future / at-scale |
|---|---|---|
| Mobile | React Native + Expo + TypeScript | Native modules, richer offline |
| Web | Next.js + TypeScript (PWA, business portal, authority dashboard) | — |
| Backend | Python + FastAPI, **modular monolith** | Service extraction only when justified |
| API Gateway | Kong (API Design's resolved "final baseline"; Traefik/NGINX named as alternatives elsewhere, unresolved) | — |
| Identity | Keycloak + OIDC/OAuth 2.1 (+MFA) | Zero-trust service identity |
| Authorization | RBAC + ABAC + OPA policy engine | — |
| Database | PostgreSQL (system of record) | Multi-region replicas |
| Geospatial | PostGIS | Destination digital twin |
| Spatial indexing | H3 | Large-scale spatial analytics |
| Cache/live state | Redis | — |
| Vector/semantic | pgvector (deliberately avoids a separate vector DB in MVP) | Dedicated vector DB if justified |
| Object storage | S3-compatible / MinIO | — |
| AI/LLM | Model-agnostic AI Gateway + Model Router | Private/local models |
| RAG orchestration | LlamaIndex or LangChain (unresolved — `[ASSUMPTION]` pick one) | — |
| ML | PyTorch, scikit-learn, XGBoost/LightGBM | Temporal deep learning |
| Computer vision | OpenCV + YOLO-class detectors | Edge inference |
| GIS rendering | MapLibre + OpenStreetMap | — |
| Routing engine | OSRM / GraphHopper / Valhalla (unresolved — `[ASSUMPTION]` pick one) | — |
| Realtime | WebSockets + Redis | Kafka + Flink/Kafka Streams |
| IoT ingestion | MQTT (pilot-stage per most sources — see Conflict Register §2) | Kafka event backbone |
| Offline (mobile) | SQLite + sync queue + connectivity manager | Edge gateways, stronger P2P mesh |
| Policy engine | OPA | Cross-agency policy enforcement |
| Secrets | Vault / managed secret store | — |
| Observability | OpenTelemetry + Prometheus + Grafana + Loki | — |
| ML lifecycle | MLflow | — |
| CI/CD | Docker + GitHub Actions | Kubernetes (only if justified) |
| Deployment | 1–2 cloud VMs / managed DB (SIH MVP) | Managed containers → Kubernetes → hybrid/government cloud + edge (national) |

Explicitly **excluded from MVP** by the documents' own guardrails: Kafka, Kubernetes,
Apache Flink/Kafka Streams, ClickHouse/lakehouse, a microservice fleet, a separate
vector database, digital twin infrastructure, nationwide mesh networking claims.

## J. System architecture

**Modular monolith.** One FastAPI deployment with logical module boundaries that mirror
future service-extraction boundaries. Confirmed identically in Technology Stack,
System Design, API Design, and Database Design documents. Core architecture rule
(System Design, verbatim): *"Clients stay thin. Trusted backend modules own business
rules, permissions, AI decisions, safety policies and audit logic."*

Canonical layered diagram (System Design §1, corroborated by API Design §1–2 and DB
Design §1): five parallel pillars — **Experience, API+Identity, AI/Decision,
Spatial/Realtime, Data** — all feeding into one shared **Trust+Governance/Operations**
layer (OPA, human-in-the-loop, consent/audit, OpenTelemetry/MLflow).

Logical backend modules (System Design §2 / Technology Stack §8, reconciled): Auth &
Users, Tourism, AI Planning, Safety, Crowd, Emergency, Communication (offline/notify),
Bookings, Trust, Analytics, Interoperability, Policy.

## K. Database architecture

PostgreSQL is the single authoritative transactional store, logically separated into
schemas. Two schema-count proposals exist in the Database Design document itself (a
"Revised" 8-domain grouping vs. the appended "Baseline" 13-schema table) that don't
reconcile — see [Conflict Register §6](02-conflict-register.md) for the recommended
merge. PostGIS handles all true geospatial data; H3 handles spatial aggregation for
privacy-preserving crowd analytics; pgvector holds embeddings for RAG (deliberately
co-located with structured data rather than a separate vector DB); Redis holds
reconstructable live/hot state only, never authoritative business state; S3/MinIO holds
all media (never in transactional rows). Every critical workflow (SOS, payment,
booking) pairs a current-state table with an append-only event-history table — the
document's own "Database North Star" question set: *"Where are tourists? What is
happening? What is likely to happen? Why did the AI recommend this? What action was
authorized? What changed? Can we prove it?"*

## L. API architecture

REST for transactional operations under `/api/v1`, WebSockets for live state, signed
webhooks for external async events, internal domain events (stable names now, Kafka
transport later at scale). Canonical resource patterns and full endpoint catalog:
`05-traceability-matrix-mvp.md` (MVP subset) and the API Design extraction (full
catalog, ~100+ named endpoints across ~20 domains). SOS state machine (confirmed
identically across API Design, System Design, NFR, DB Design): `CREATED →
ACKNOWLEDGED → AUTHORITY_NOTIFIED → RESOURCE_ASSIGNED → RESPONDER_ARRIVED → RESOLVED`.
Idempotency-Key required on all booking/payment/SOS/sync writes. Cursor pagination,
ETag caching, stable machine-readable error envelopes, OpenAPI-first contracts.

## M. Security architecture

Defense in depth, confirmed consistently: Keycloak + OIDC/OAuth 2.1 (+MFA) for user
identity; RBAC + ABAC + OPA for authorization; **explicitly separate credential models**
for user identity, service identity, device/IoT identity, and provider/webhook
authenticity (System Design & API Design both state this separation as a named rule —
*"should not be collapsed into one credential model"*); WAF + API gateway + rate
limiting at the edge; TLS + encryption at rest; Vault/managed secrets; signed webhooks
with replay protection; append-only (the documents' own hedge: "immutable-ish") audit
trail; PostgreSQL Row-Level Security where appropriate.

## N. AI architecture

AI is explicitly **not** the source of truth in any of the 7 documents — this is the
most consistently repeated rule in the entire document set, worded near-identically in
Technology Stack, System Design, API Design and NFR:

> "The LLM never becomes an irreversible emergency authority." /
> "AI recommends. Policy decides. Authorized humans control high-impact actions."

Pipeline (System Design §5, corroborated by API Design §6): **AI Gateway** (auth,
quota, cost, tracing) → **Model Router** (selection + fallback) → **Agents** (planner,
safety, fraud, domain-specific) → **Tools + RAG** (explicit tool calls; retrieval
against an approved, provenance-tracked knowledge base) → **Guardrails** (schema
validation, prompt-injection isolation, tool-credential scoping) → **Policy Gate**
(OPA, deterministic) → optional **Human Workflow** (high-impact review) → **Action**
(auditable). Every predictive output must be traceable to a model version, confidence,
and validity window (Database Design §11).

## O. GIS architecture

Treated as a first-class subsystem across all four architecture documents. PostGIS for
spatial queries/geofencing/nearest-resource lookup; H3 for privacy-aware spatial
aggregation (crowd heatmaps); MapLibre + OpenStreetMap for rendering with provider
abstraction; a routing engine (OSRM/GraphHopper/Valhalla — unresolved, pick one) behind
a service interface computes actual route geometry. **The LLM may explain or select
among validated route candidates; it must never invent road geometry** — stated as a
named rule ("Spatial rule" / "GIS principle") in System Design, API Design, and
Database Design identically. Route scoring is a weighted spatial cost function over:
travel time, incident density, crowd density, isolation/road isolation, time of day,
accessibility constraints, weather, and emergency-resource proximity (see
[Conflict Register §5](02-conflict-register.md) for the one place a document dropped
the emergency-proximity term).

## P. Offline architecture

Mobile: SQLite local store → durable sync queue (each operation carries a unique
`operation_id`, idempotent) → connectivity manager → authenticated sync to
PostgreSQL (server is authoritative; client reconciles conflicts via version/If-Match).
**SOS receives local acknowledgement before cloud delivery succeeds** — stated as a
hard requirement in Technology Stack, System Design, API Design and NFR identically.
BLE/Wi-Fi Direct peer relay is **explicitly a pilot investigation only, never an MVP
guarantee** — repeated verbatim across four documents ("Do not claim nationwide mesh
networking in the MVP" is one of Technology Stack's nine named engineering guardrails).
Maturity path: MVP local queue → pilot peer relay → future edge gateways / stronger
peer-to-peer emergency mesh.

## Q. Integration architecture

All external systems (tourism authority, police/emergency, transport, weather/disaster,
business/credential/KYC, payments, maps) sit behind provider adapters that normalize
into stable internal contracts — *"Provider-specific schemas never leak directly into
internal domain modules"* (API Design). Webhooks require signature verification,
timestamp/replay-window checks, provider event ID deduplication, payload-hash tamper
detection, persist-before-process, and dead-letter handling. One structural gap: the
System Design's adapter diagram shows a "Municipality" adapter with **zero
corresponding specification** anywhere in the document set (see
[Architecture Audit](06-architecture-audit-and-gaps.md)).

## R. Deployment architecture

Staged, identical across Technology Stack, System Design, API Design, Database Design:

| Stage | Deployment | Adds |
|---|---|---|
| SIH MVP | 1–2 cloud VMs / managed DB | Docker, FastAPI, Next.js, React Native, PostgreSQL/PostGIS/pgvector, Redis |
| Pilot destination | Managed containers + managed DB | WebSockets*, MQTT, object storage, OpenTelemetry, MLflow |
| Regional | Kubernetes / managed container platform | Kafka, autoscaling, ClickHouse, stream processing |
| National | Hybrid / government-approved cloud + edge | Multi-region, lakehouse, digital twin, stronger governance |

\* System Design's own §19 table places "WebSockets + managed containers" at Pilot
stage, contradicting 4 other passages in the same document that treat WebSockets as
MVP-day-one — resolved in favor of MVP-day-one; see
[Conflict Register §2](02-conflict-register.md). No cloud provider is named anywhere
(deliberate, per the stated "no hidden cloud dependency" principle).

## S. Observability architecture

OpenTelemetry end-to-end (gateway → FastAPI → AI → GIS → DB adapters → external calls,
carrying `traceparent`/`request_id`/`correlation_id`), Prometheus + Grafana for metrics,
Loki for logs, MLflow for ML experiment/version tracking. Required metric families
(NFR §12, API Design §16, identical): traffic, latency (p50/p95/p99 — though only p95
targets are ever numerically fixed), reliability (4xx/5xx/timeout), AI (model latency,
token usage, tool-call count, failure rate), safety (SOS ack + dispatch latency),
realtime (active sockets, reconnects, dropped connections), integrations (webhook lag,
provider errors, retries), database (pool saturation, query latency), jobs (queue
depth, duration, failure rate), uploads (failures, processing latency).

## T. Disaster recovery strategy

PostgreSQL: backups + WAL/PITR + controlled failover, **with mandatory restore-test
verification** ("Backups are not sufficient until restore results are measured" — NFR
§15). Redis: treated as reconstructable hot state, not a backup target. Object storage:
versioning + lifecycle policies. **No RPO/RTO numeric value is stated anywhere in the
7-document set for any service** — explicitly deferred to pilot-freeze, per NFR's own
admission. This must not be presented as "recoverable" or "production-ready" until
service-specific RPO/RTO targets are defined and restore drills are actually run and
measured, per the No-False-Completion rule.

## U. MVP scope (SIH build target)

Frozen per Technology Stack "Phase 1 – Core MVP" (corroborated by System Design's
"NOW - SIH MVP" column and API Design's P0 endpoint set — three independent documents
converge on the same slice):

- React Native tourist app
- FastAPI modular monolith backend
- PostgreSQL + PostGIS + pgvector
- AI planner + RAG assistant (grounded, tool-calling, policy-gated)
- Smart destination discovery
- Safe-route scoring (spatial cost function, not LLM-generated)
- One-tap SOS + trusted-contact flow + local offline acknowledgement
- Authority dashboard (live map, incident/SOS monitoring)
- Offline local queue + sync

Recommended demo journey (System Design's own "Recommended SIH demonstration," matching
the governing instructions' required E2E test journey exactly): **Plan a trip → detect
changing crowd/safety context → reroute → trigger SOS in an offline condition → restore
connectivity → route to authority response.**

Full endpoint/table/component traceability for this slice:
[05-traceability-matrix-mvp.md](05-traceability-matrix-mvp.md).

## V. Pilot scope (P1)

Dynamic itinerary using live weather/crowd context; crowd density + forecasting
prototype (XGBoost/LightGBM); offline-first sync hardening; AI scam/suspicious-listing
detector; multilingual voice assistant; live WebSocket events at pilot scale; MQTT +
IoT counters; offline peer relay **prototype** (BLE/Wi-Fi Direct, explicitly not a
guarantee); business/guide verification + verifiable credentials; predictive
tourist-flow analytics; local economy recommendations.

## W. Regional scope (P2)

Kubernetes / managed container platform; Kafka + stream processing (Flink/Kafka
Streams); ClickHouse/lakehouse analytics; autoscaling; multi-destination analytics;
stronger SOC/SIEM security operations; edge compute (Raspberry Pi/Jetson-class
gateways) for local sensor fusion and CV inference.

## X. National / future scope (P3)

Hybrid/government-approved cloud + edge; multi-region services; destination digital
twin (crowd/disaster/traffic/capacity simulation, what-if analysis); national tourism
knowledge graph; open tourism ecosystem APIs; government-wide interoperability layer;
decentralized identity/credential interoperability; the Feature Blueprint's 20-item
"Advanced / Future" domain (nationwide tourism intelligence graph, autonomous
tourist-flow management, predictive evacuation system, AI-powered local economy
optimizer, etc.).

---

*Next: [02-conflict-register.md](02-conflict-register.md) for every place these
documents disagree, and how each is resolved.*
