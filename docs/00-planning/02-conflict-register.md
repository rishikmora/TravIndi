# Conflict Register — SIH 26204

Status: **DESIGNED**. Every conflict found *within or across* the 7 source documents
during extraction, with a recommended resolution and an explicit call on whether user
confirmation is required before proceeding. Resolution follows the stated source-priority
hierarchy (FR &gt; System Design &gt; API Design &gt; DB Design &gt; NFR &gt; Tech Stack &gt; Feature
Blueprint &gt; best practice) wherever the hierarchy actually answers the question; where
it doesn't (e.g., a document contradicting itself, or a genuine architecture trade-off),
that's stated explicitly.

Format per entry: **Requirement · File A · File B · Exact conflict · Impact ·
Recommended resolution · Reason · User confirmation required?**

---

## 1. Feature taxonomy mismatch — 30 domains vs. 42 domains

- **Requirement:** a single, coherent feature/requirement taxonomy to drive module and
  schema boundaries.
- **File A:** Feature Blueprint — 30 domains, 659 capability names.
- **File B:** Functional Requirements — 42 domains, 565 requirement-entry names.
- **Exact conflict:** both documents claim to be "the complete list supplied for SIH
  26204" (near-identical self-description in both cover pages), yet they group the
  same subject matter into structurally different, non-isomorphic taxonomies (e.g.
  Blueprint's single "Advanced AI" domain, 42 items, roughly corresponds to FR's three
  separate domains "AI Travel Planning" / "AI & Computer Vision" / "AI Tourist Guide").
  Neither document provides a mapping between the two schemes, and neither declares
  the other subordinate.
- **Impact:** without reconciliation, module/schema design could be built twice, or
  inconsistently, depending on which document an engineer opens first.
- **Recommended resolution:** treat the **42-domain FR taxonomy as authoritative** for
  module and schema boundaries (it is more granular and its domain names echo the
  System Design's own module list almost exactly — Auth, Safety, Emergency, Crowd,
  Trust, Booking, Analytics, Administration, etc.). Treat the Feature Blueprint as a
  **supplementary broader-capability catalog**, useful chiefly for its P3 "Advanced /
  Future" domain and for capability names not present in the FR list at all (a
  non-exhaustive scan found the Blueprint contains some domains — e.g. Digital Twin,
  Virtual Tourism — with no FR counterpart at all; treat these as Blueprint-only P2/P3
  additions, not conflicts).
- **Reason:** the governing source-priority hierarchy ranks Functional Requirements
  above Feature Blueprint explicitly (rule 1 vs. rule 7).
- **User confirmation required?** **No** — hierarchy resolves it cleanly. Flagged here
  for visibility only.

## 2. WebSocket MVP-vs-Pilot staging (System Design self-contradiction)

- **Requirement:** whether WebSockets are MVP-day-one infrastructure or a pilot-stage
  addition.
- **File A:** System Design §19 "Implementation Boundaries" table places "WebSockets +
  managed containers" in the **PILOT / NEXT STAGE** column.
- **File B:** System Design §1 (overview diagram), §14 ("MVP realtime" = WebSockets +
  Redis), and §20 (final checklist: "WebSockets + Redis **in MVP**") all state the
  opposite. Technology Stack, API Design, NFR, and Database Design all independently
  also treat WebSockets + Redis as MVP-scope.
- **Exact conflict:** one table cell inside System Design contradicts the same
  document's own final checklist and four other documents.
- **Impact:** low — a wrong reading would only delay building the realtime layer, not
  break anything if corrected before Phase 13/16.
- **Recommended resolution:** WebSockets + Redis are **MVP-scope**. Treat System
  Design §19's placement as a drafting defect (most likely: it meant to flag
  *managed-container-orchestrated* WebSocket infra as pilot-stage, while a simpler
  self-hosted implementation is MVP-appropriate — but the document never states this
  distinction, so it's read as an error, not a hidden intent).
- **Reason:** 5 of 6 total mentions across the whole document set (including the same
  document's own final checklist) agree; overwhelming weight of evidence.
- **User confirmation required?** **No.**

## 3. MQTT MVP-vs-Pilot staging

- **Requirement:** whether MQTT/IoT ingestion is part of the MVP build.
- **File A:** System Design §1 overview diagram lists MQTT undifferentiated inside the
  MVP-level "Spatial/Realtime" pillar box.
- **File B:** System Design §14, §19, §20 and Technology Stack's own Phase roadmap all
  place MQTT/IoT explicitly at **Pilot** stage, not MVP.
- **Recommended resolution:** MQTT/IoT sensor ingestion is **Pilot-scope (P1), not
  MVP**. The overview diagram is a high-level architecture picture, not a build-phase
  commitment; every place that actually discusses build sequencing (§14, §19, §20,
  Tech Stack's 4-phase roadmap) agrees MQTT is post-MVP.
- **Reason:** consistent with the MVP scope frozen in
  [01-project-master-model.md §U](01-project-master-model.md).
- **User confirmation required?** **No.**

## 4. API route path naming: `/api/v1/routes/{mode}` vs. `/geo/{mode}-route`

- **Requirement:** canonical URL pattern for safe/crowd-free/accessible/emergency
  route endpoints.
- **File A:** API Design's Revised Master (§3 canonical pattern table, §10 endpoint
  table) — `/api/v1/routes/safe`, `/api/v1/routes/crowd-free`,
  `/api/v1/routes/accessible`, `/api/v1/routes/emergency`.
- **File B:** the appended original API Design blueprint (§04 Surface Map) —
  `/geo/safe-route`, `/geo/crowd-free-route`, `/geo/accessible-route`; one table
  (§07.06) even mixes both conventions in the same table.
- **Impact:** if unresolved, two different route paths could be implemented for the
  same operation.
- **Recommended resolution:** use `/api/v1/routes/{mode}` (the Revised Master
  convention).
- **Reason:** the API Design document explicitly states *"Use this revised section as
  the implementation baseline. Use the appended 38-page source blueprint as the full
  reference record"* — the document resolves this conflict itself. The Revised
  Master's own "Normalization rule" (§3) also explicitly warns against exactly the
  `/geo/*` vs `/routes/*` mixing found in the appendix, confirming the mixing is a
  known defect being carried forward for the record, not a live option.
- **User confirmation required?** **No.**

## 5. Incident/SOS command-endpoint prefix

- **Requirement:** canonical path for incident assign/resolve/escalate actions.
- **File A:** API Design Revised Master §12.1 (state-changing command convention
  examples) — `/api/v1/incidents/{id}/assign`, `/api/v1/incidents/{id}/resolve`.
- **File B:** API Design Revised Master §3 (its own canonical resource table) and the
  appended blueprint §07.07 — `/api/v1/emergency/incidents/{id}/assign`, `.../escalate`,
  `.../resolve`.
- **Recommended resolution:** use `/api/v1/emergency/incidents/{id}/*` as the canonical
  path. §3 is the document's dedicated, deliberate canonical-pattern table; §12.1 is
  illustrating a *pattern* (state-changing commands generally), not redefining the
  resource path, and it also omits `/escalate` even though escalation is a defined
  lifecycle step everywhere else — further evidence §12.1 is a shorthand example, not
  a competing spec.
- **Reason:** consistency with the document's own dedicated canonical-naming section
  and with the appended source blueprint.
- **User confirmation required?** **No** (low-risk, cosmetic at this stage).

## 6. Database schema/domain grouping: 8-domain "Revised" grouping vs. 13-schema "Baseline" table — **RESOLVED 2026-09-07**

- **Requirement:** the actual PostgreSQL schema boundaries to implement.
- **File A:** Database Design "Revised" §4 — 8 color-coded domain boxes (Identity,
  Tourism/Travel, Business, Booking/Payment, Safety/Emergency **combined**, AI/Knowledge,
  Crowd/IoT, Trust/Governance).
- **File B:** Database Design "Baseline" appendix §3 — 13 named schemas: identity,
  tourism, travel, safety, **emergency (separate)**, crowd, business, booking, payment,
  trust, **analytics, integration, governance** (these last three have no counterpart
  in File A at all). Baseline's own 13-schema table, in turn, has **no schema at all**
  for AI/RAG data, even though the same Baseline document describes 11 AI/RAG tables
  in full elsewhere (§11) — i.e., File B is also internally incomplete.
- **Impact:** real — this is an actual schema-design decision, not a cosmetic naming
  issue. Getting it wrong means re-migrating tables across schemas later.
- **Recommended resolution:** adopt a **reconciled 14-schema set** for
  implementation: the Baseline's 13 schemas (identity, tourism, travel, safety,
  emergency, crowd, business, booking, payment, trust, analytics, integration,
  governance) **plus one new `knowledge` schema** for the AI/RAG tables that exist in
  the source text but have no schema home in either version. Keep `safety` and
  `emergency` as **separate** schemas (Baseline's split), because the NFR document
  treats SOS/emergency as its own dedicated P0 critical path distinct from general
  risk-zone/safety-score data — merging them (as the Revised grouping does) would blur
  that boundary at exactly the place NFR and System Design both call out for the
  tightest audit/latency requirements.
- **Reason:** the Baseline table is more complete (it's the only one with
  analytics/integration/governance schemas, which the NFR document's observability and
  audit requirements will need somewhere to live); the emergency/safety split matches
  the NFR document's own P0 criticality boundary.
- **Resolution:** confirmed as [09-database-schema-plan.md](09-database-schema-plan.md)
  on 2026-09-07 — 14 schemas as proposed, IoT tables folded into `crowd` for MVP, RLS
  limited to `sos_requests`/`incidents`/`users`/`user_profiles`/`trusted_contact_access_tokens`,
  SQLAlchemy 2.0 (async) + Alembic + GeoAlchemy2 + pgvector-sqlalchemy for tooling.
- **User confirmation required?** **Done.**

## 7. Role/permission matrix — does not exist anywhere — **RESOLVED 2026-09-07**

- **Requirement:** a mapping of role → permitted actions/resources, needed for RBAC/ABAC
  implementation.
- **Files:** all 7 documents reference "Tourist," "Guide," "Business," "Authority" (and
  authority sub-personas: Police, Tourism Authority, Municipality) but **none of the 7
  documents anywhere states which role can perform which action.** OAuth scope names
  exist in API Design (`tourism:read/write`, `authority:incident:manage`, etc.) but are
  never mapped to the four account types.
- **Impact:** blocks concrete Keycloak realm/role configuration and OPA policy
  authoring (Phase 9) until resolved.
- **Resolution:** authored as [08-role-permission-matrix.md](08-role-permission-matrix.md)
  and confirmed with the user on 2026-09-07. Authority sub-personas (Police, Emergency
  Responder, Tourism Dept, Municipality) are roles under one `authority` account type;
  Trusted Contact gets no platform account, only a one-time OTP-gated SOS-scoped
  token; Business/Guide verification is owned by a dedicated `authority_verifier`
  role.
- **User confirmation required?** **Done.**

## 8. Safe-route cost function — 4-term vs. 5-term formula (Database Design self-contradiction)

- **Requirement:** the exact weighted spatial cost function for "safest route" scoring.
- **File A:** Database Design "Revised" §7 —
  `safe_cost = time_weight·travel_time + risk_weight·incident_density + crowd_weight·crowd_density + isolation_weight·road_isolation`
  (4 terms), with prose stating emergency proximity "can be added" as a future feature.
- **File B:** Database Design "Baseline" appendix §7 — the same formula **plus** a
  fifth, subtracted term: `− emergency_weight·emergency_proximity`.
- **Cross-document corroboration:** NFR §10, System Design §7, and API Design §10 (the
  Revised Master itself, in a different section) **all list emergency-resource
  proximity as a real route-scoring input**, alongside travel time, incident density,
  crowd density, isolation, time of day, accessibility, and weather.
- **Recommended resolution:** implement the **5-term formula, including emergency
  proximity**. The 4-term "Revised" version's own prose contradicts itself (calling
  emergency proximity a "future" addition while claiming to be an additive revision of
  a baseline that already includes it), and three independent other documents confirm
  emergency proximity belongs in the live MVP scoring function.
- **Reason:** weight of cross-document evidence (3 other documents) plus internal
  self-contradiction in the dissenting document.
- **User confirmation required?** **No.**

## 9. API Gateway product choice

- **Requirement:** which API gateway product to deploy.
- **File A:** Technology Stack and System Design present three unresolved
  alternatives: "Kong / Traefik / NGINX."
- **File B:** API Design's own "Final Baseline" (§18/§20) states plainly: **"Gateway:
  Kong primary."**
- **Recommended resolution:** **Kong.**
- **Reason:** API Design ranks above Technology Stack in the source-priority hierarchy,
  and API Design is the one document that actually commits to a single choice rather
  than leaving alternatives open.
- **User confirmation required?** **No.**

## 10. WebSocket envelope contract vs. the only concrete example given

- **Requirement:** required fields on every WebSocket message.
- **File A (the rule, stated 3×):** every WS envelope must carry `event_id` +
  `sequence` + `type` + `version` + `timestamp` + `data` (API Design §7; System Design;
  NFR §10, "event_id + sequence + version to detect gaps, duplicates and out-of-order
  delivery").
- **File B (the only concrete example given, API Design §13 / Database Design):** the
  one illustrated `crowd.updated` payload has only `type`, `destination_id`, `h3_cell`,
  `density`, `risk_score`, `timestamp` — missing `event_id`, `sequence`, `version`, and
  not wrapped in a `data` object.
- **Recommended resolution:** implement to the **stated rule**, not the abbreviated
  example. The example predates or simplifies for illustration; the rule is repeated
  independently in three documents including the NFR quality contract.
- **User confirmation required?** **No.**

## 11. Rate-limit numbers exist only in a document explicitly marked "not the baseline"

- **Requirement:** numeric API rate limits.
- **File A:** the only concrete numbers anywhere (5 req/min/IP for auth, 100 req/min/user
  normal, 20 req/min/user AI, 60 req/min/IP public search) live in the **appended
  original API Design blueprint** (§17), which that same document set calls "the full
  reference record," not the implementation baseline.
- **File B:** the Revised Master (declared the implementation baseline) has no rate-limit
  numbers at all.
- **Impact:** none blocking — the source blueprint's own callout says *"Limits are
  examples for design. Tune from observed traffic... before production."*
- **Recommended resolution:** use the appendix's numbers as **starting defaults**
  during MVP build, explicitly labeled as tunable, not frozen. Re-derive real limits
  from observed load per the NFR document's own capacity-freeze process.
- **User confirmation required?** **No** — but do not present these numbers as
  final/sourced in any NFR sign-off; label as `[ASSUMPTION — Category C]`.

## 12. Routing engine and RAG orchestration library — left as open alternatives everywhere

- **Requirement:** one routing engine (OSRM / GraphHopper / Valhalla) and one RAG
  library (LlamaIndex / LangChain).
- **Files:** every document that mentions these (Technology Stack, System Design, API
  Design, Database Design) lists the same 2–3 alternatives without ever picking one.
- **Impact:** blocks concrete Phase 13 (GIS) and Phase 12 (AI/RAG) implementation
  choices.
- **Recommended resolution:** not a document conflict to "resolve" — genuinely
  undecided everywhere. Treated as an engineering assumption to make during
  implementation, not a cross-document contradiction (see
  [Assumption Register](03-assumption-register.md)).
- **User confirmation required?** **No**, but the specific pick should be called out
  when Phase 12/13 begins so the user can object if they have a preference (e.g. an
  existing self-hosted OSRM instance, an existing LangChain codebase elsewhere).

---

*Next: [03-assumption-register.md](03-assumption-register.md) for every place a
document was silent and an engineering call had to be made.*
