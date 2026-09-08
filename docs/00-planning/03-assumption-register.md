# Assumption Register — SIH 26204

Status: **DESIGNED**. Every place the 7 source documents are silent, ambiguous, or
incomplete, classified per the governing rule:

- **A** — Explicitly defined in a source document
- **B** — Strongly implied by a source document
- **C** — Engineering assumption (reasonable default, not sourced — must be labeled as
  such wherever used, never presented as fact)
- **D** — Missing requirement (a real gap; needs a decision, ideally from the user or
  product owner)
- **E** — Conflict (see [02-conflict-register.md](02-conflict-register.md) instead)

Only B–D items are listed below (A items need no register entry).

---

## Category B — Strongly implied, not explicit

| # | Item | Basis | Where it matters |
|---|---|---|---|
| B1 | The problem being solved (tourists lack a unified safe-travel platform; authorities lack real-time situational intelligence) | Inferred from the shape of the P0 feature slice; no explicit problem statement in any of the 7 docs | Product framing, pitch materials |
| B2 | Domain 30 ("Advanced / Future") in the Feature Blueprint is the only explicitly future-tagged content; everything else in Domains 1–29 is *not* stated to be MVP-ready, only *not explicitly future* | Feature Blueprint extraction, Part 5 | Do not assume every non-Domain-30 feature is near-term just because it isn't tagged future |
| B3 | "Authority" account likely subdivides into Police / Tourism Authority / Municipality / Emergency-services sub-roles at the dashboard level | System Design §10 adapter diagram + Feature Blueprint's Government Intelligence domain (distinct dashboards named) | RBAC/ABAC design — see Conflict Register §7, escalated to Category D below |

## Category C — Engineering assumptions (defaults chosen, not sourced)

These are proposed defaults for build purposes. Each **must be surfaced to the user
again at the point of implementation** (Phase 12/13 for the AI/GIS picks; Phase 9 for
auth) so they can object before it's load-bearing.

| # | Item | Proposed default | Why this default | Revisit at |
|---|---|---|---|---|
| C1 | Routing engine (OSRM vs. GraphHopper vs. Valhalla — never resolved by any source doc) | **OSRM** | Open-source, self-hostable, lightest operational footprint for an MVP-scale single-region deployment; GraphHopper/Valhalla are heavier to operate for a first cut | Phase 13 (GIS/navigation) |
| C2 | RAG orchestration library (LlamaIndex vs. LangChain — never resolved) | **RESOLVED 2026-09-07 — neither.** Surfaced to the user per this row's own "revisit at Phase 12" note; overridden to a hand-rolled approach (`backend/app/core/ai/rag.py`): one embedding call + one pgvector cosine-similarity SQL query, which the originally-proposed LlamaIndex default (or LangChain) would only wrap in retriever/query-engine abstractions for no benefit at this scale. Embedding provider also changed mid-implementation: planned as OpenAI (1536-dim), switched to a local `sentence-transformers` model (`all-MiniLM-L6-v2`, 384-dim) when no OpenAI/Voyage key was available — Anthropic (the chosen LLM provider) has no embeddings API of its own. | Done — see [07-implementation-roadmap.md](07-implementation-roadmap.md) Phase 12 |
| C3 | Provisional MVP capacity targets (NFR document explicitly defers all of these) | e.g. ~50–200 concurrent users, ~50–100 req/s peak, SOS ack target &lt; 5s end-to-end (not sourced — purely a testable placeholder) | Needed so load tests (Phase 20) have *something* to run against; NFR explicitly says these must be frozen during pilot, not invented now | Phase 20 (NFR/load evaluation) — must be replaced with real pilot-measured numbers, never reported as "verified" against these placeholders |
| C4 | Accessibility conformance target (NFR explicitly leaves this undefined) | **WCAG 2.1 AA** as the working target for critical flows (SOS, navigation, emergency instructions) | Industry-standard baseline; NFR explicitly calls accessibility failures on these flows "P0 defects" so *some* standard is needed to test against | Phase 18 (tests) / Phase 13 (usability) |
| C5 | Numeric rate limits (only present in API Design's non-baseline appendix, explicitly called "illustrative") | Carry forward appendix's numbers (5/min auth, 100/min normal, 20/min AI, 60/min search) as MVP starting values | Document's own stated intent — "tune from observed traffic... before production" | Phase 19 (security review) |
| C6 | Notification channel vendors (FCM+APNs and an unnamed SMS provider are named generically, no vendor picked) | Defer vendor choice; keep behind the stated provider-abstraction adapter so switching is cheap | No source document names a vendor | Phase 16 (offline/notifications) |
| C7 | Payment gateway vendor (never named anywhere — only "UPI / cards / wallets" generically) | Defer vendor choice; keep behind payment-gateway abstraction | No source names a vendor; India-specific UPI support is implied but not mandated to one provider | Whenever payments are actually built (P1, not P0 — SOS/planning MVP doesn't require live payments) |

## Category D — Missing requirements (real gaps, need a decision)

| # | Item | Why it's a real gap | Recommended path | Needs user input? |
|---|---|---|---|---|
| D1 | **Role-permission matrix.** No document states which of Tourist/Guide/Business/Authority can do what. | Blocks concrete Keycloak realm/role and OPA policy design (Phase 9). | **RESOLVED 2026-09-07** — see [08-role-permission-matrix.md](08-role-permission-matrix.md), confirmed with user. | Done |
| D2 | **Authority sub-role structure.** Is "Police dashboard" a separate role/scope from "Tourism Authority dashboard" and "Municipality dashboard," or one Authority role with different views? | Same root cause as D1 but specifically affects how many Keycloak roles/scopes exist under "Authority." | **RESOLVED 2026-09-07** — roles under one `authority` account type; see [08-role-permission-matrix.md](08-role-permission-matrix.md). | Done |
| D3 | **Municipality external-system adapter.** System Design's own interoperability diagram (§10) shows a "Municipality" adapter node with **zero** corresponding row in the accompanying table, and no other document mentions what a Municipality integration would even do. | Cannot design this adapter — there's nothing to design against. | Treat as **out of MVP scope** (P1/P2); revisit only if a concrete municipal integration requirement surfaces from the user or a later document. | Only if/when it becomes relevant |
| D4 | **NFR numeric thresholds** (capacity, AI-quality, realtime, RPO/RTO — the entire list in NFR §C "TO BE MEASURED / FROZEN DURING PILOT") | The NFR document itself says these cannot be safely invented — no engineering assumption should substitute for them being "frozen." | Use Category C provisional placeholders (C3 above) purely to make automated tests runnable during MVP build; escalate real freeze to a pilot-planning conversation with the user before any "meets NFR" claim is made. | **Yes, before any NFR compliance claim is made** |
| D5 | **Money handling detail** — NUMERIC + ISO-4217 is stated as a convention, but no source document says which currencies must be supported beyond implying INR (India) as primary. | Affects schema (currency column width/format) and payment integration scope. | Assume **INR-primary, multi-currency-capable schema** (NUMERIC + ISO-4217 code column, no hardcoded currency) since the platform is explicitly for tourism *in* India but may serve international tourists booking in their home currency. | No — low-risk default, flag only |
| D6 | **Database schema count** (8 vs. 13 vs. reconciled 14 — see Conflict Register §6) | Real design decision with a proposed default, not fully resolved by hierarchy alone. | **RESOLVED 2026-09-07** — see [09-database-schema-plan.md](09-database-schema-plan.md), confirmed with user (14 schemas, IoT folded into `crowd`, RLS scope, SQLAlchemy+Alembic tooling). | Done |

---

*Next: [04-feature-priority-matrix.md](04-feature-priority-matrix.md) for the full
P0/P1/P2/P3 classification.*
