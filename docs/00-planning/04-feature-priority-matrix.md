# Feature Priority Matrix — SIH 26204

Status: **DESIGNED**. Classifies every domain from both feature taxonomies into
P0 (SIH MVP critical) / P1 (pilot/enhancement) / P2 (regional/national future) / P3
(visionary/research), per the governing Feature Scope Control rules. The Functional
Requirements' 42-domain taxonomy is primary (per
[Conflict Register §1](02-conflict-register.md)); the Feature Blueprint's 30 domains
are cross-referenced alongside it.

**Method:** classification is driven primarily by Technology Stack's own explicit
4-phase SIH build roadmap (Phase 1 Core MVP → Phase 2 Differentiation → Phase 3
Advanced Pilot → Phase 4 Future Vision), cross-checked against System Design's
"NOW / PILOT / FUTURE" implementation-boundaries table and NFR's priority-by-scale
matrix. Where a domain spans multiple phases (e.g. "Smart Navigation" has a P0 core —
safe routing — and P2 extras — AR navigation), the domain is marked at its **lowest
(most urgent) priority actually present**, with the split noted.

No feature is deleted. P1–P3 domains remain fully catalogued (full item lists live in
this session's extraction transcripts, referenced in
[01-project-master-model.md §F](01-project-master-model.md)); they are staged, not cut.

---

## Functional Requirements — 42 domains classified

| # | Domain (FR) | Items | Priority | Rationale |
|---|---|---|---|---|
| 01 | User Management | 9 | **P0** | Auth/accounts foundational to everything |
| 02 | AI Travel Planning | 13 | **P0** | Tech Stack Phase 1: "AI planner + RAG assistant" |
| 03 | Destination Discovery | 10 | **P0** | Tech Stack Phase 1: "Smart destination discovery" |
| 04 | Smart Navigation | 16 | **P0** core / P2 extras | Core = safe-route scoring (Phase 1); AR nav, voice nav = P2 |
| 05 | Tourist Safety | 17 | **P0** | Tech Stack Phase 1: "One-tap SOS + trusted contact flow" |
| 06 | Emergency Management | 15 | **P0** | Core MVP demo journey ends in authority response |
| 07 | Offline & Emergency Communication | 12 | **P0** core / P1 extras | Local queue + local ack = P0; BLE/Wi-Fi Direct peer relay = P1 pilot only |
| 08 | Crowd Management | 16 | **P0** minimal / P1 full | Basic crowd view needed as a safe-route input (P0); density/forecasting = Tech Stack Phase 2 |
| 09 | AI & Computer Vision | 17 | **P2** | Not named in any MVP phase; CV pilot only at Advanced Pilot stage per Tech Stack |
| 10 | AI Tourist Guide | 12 | **P1** | Tech Stack Phase 2: "multilingual voice assistant" |
| 11 | Translation & Language | 11 | **P1** | Same as above |
| 12 | Local Tourism | 12 | **P1** | Tech Stack Phase 3: "local economy recommendations" |
| 13 | Business Verification & Trust | 13 | **P1** | Tech Stack Phase 3: "business/guide verification" |
| 14 | Reviews & Reputation | 10 | **P1** | Supports trust domain, not core demo journey |
| 15 | Fraud & Scam Detection | 14 | **P1** | Tech Stack Phase 2: "AI scam / suspicious-listing detector" |
| 16 | Smart Ticketing | 14 | **P1** | Commerce not required for core safety/planning demo |
| 17 | Accommodation | 15 | **P1** | Same as ticketing |
| 18 | Smart Transport | 19 | **P1** | Multimodal transport beyond MVP walking/routing scope |
| 19 | Food Intelligence | 14 | **P2** | Not referenced in any MVP/pilot phase |
| 20 | Incident Management | 20 | **P0** | Feeds directly into Emergency Management / authority response |
| 21 | Lost & Found | 11 | **P2** | Not referenced in any MVP/pilot phase |
| 22 | Accessibility | 17 | **P0 cross-cutting overlay** / P1 full domain | NFR: "Accessibility failures affecting SOS, navigation or emergency instructions are P0 defects" — baseline accessibility on core flows is P0; the full accessibility feature catalog is P1 |
| 23 | Sustainability | 13 | **P2** | Not referenced in any MVP/pilot phase |
| 24 | Financial Intelligence | 14 | **P2** | Budgeting/expense tools beyond MVP scope |
| 25 | Group & Family Travel | 13 | **P2** | Not referenced in any MVP/pilot phase |
| 26 | Digital Tourism Passport | 9 | **P2** | Gamification-adjacent, not core journey |
| 27 | Gamification | 13 | **P2/P3** | Not referenced in any MVP/pilot phase |
| 28 | Social Tourism | 12 | **P2** | Not referenced in any MVP/pilot phase |
| 29 | Smart Heritage | 13 | **P2** | Not referenced in any MVP/pilot phase |
| 30 | AR / VR Tourism | 10 | **P2/P3** | Explicitly deferred (AR/VR needs mature core first) |
| 31 | IoT Integration | 18 | **P1** | Tech Stack Phase 3: "MQTT + IoT counters" |
| 32 | Government Intelligence | 18 | **P0** | Tech Stack Phase 1: "Authority dashboard" |
| 33 | Predictive Tourism | 12 | **P1** | Tech Stack Phase 3: "predictive tourist-flow analytics" |
| 34 | Digital Twin | 12 | **P3** | Tech Stack/System Design explicitly label this "FUTURE SCALE" |
| 35 | Local Economy Intelligence | 10 | **P1** | Tech Stack Phase 3 |
| 36 | Notifications & Alerts | 12 | **P0** | Required for SOS escalation and crowd alerts in the core demo journey |
| 37 | Privacy & Trust | 13 | **P0** | NFR priority matrix: Privacy is P0 at every stage including SIH MVP |
| 38 | Blockchain | 12 | **P2/P3** | Explicitly "optional... only where useful" everywhere it's mentioned |
| 39 | Analytics | 13 | **P1** | Basic operational analytics useful but not core-journey-blocking |
| 40 | Administration | 13 | **P0 minimal** / P1 full | Minimal admin needed to operate the MVP; full admin suite is P1 |
| 41 | API & Integration | 14 | **P0 minimal** / P1-P2 full | Adapter *pattern* is P0 architecture; most named external integrations (govt, transport) are P1/P2 |
| 42 | Security | 14 | **P0** | NFR priority matrix: Security is P0 at every stage including SIH MVP |

## Feature Blueprint — 30 domains cross-referenced

| # | Domain (Blueprint) | Items | Priority | Relation to FR domains above |
|---|---|---|---|---|
| 01 | Advanced AI | 42 | **P0 core / P2-P3 extras** | Core AI planner ↔ FR-02; predictive/policy-simulation items ↔ P2/P3 |
| 02 | Smart Maps | 33 | **P0 core / P2 extras** | Safe/crowd-free/accessible routing ↔ FR-04; AR/voice nav = P2 |
| 03 | Advanced Safety | 43 | **P0** | ↔ FR-05 Tourist Safety |
| 04 | Computer Vision | 30 | **P2** | ↔ FR-09 |
| 05 | IoT | 26 | **P1** | ↔ FR-31 |
| 06 | Next-Generation Connectivity | 18 | **P1 pilot / P3 stronger mesh** | ↔ FR-07 offline/emergency comms |
| 07 | Smart Heritage | 20 | **P2** | ↔ FR-29 |
| 08 | Culture | 20 | **P2** | No direct FR domain — Blueprint-only addition |
| 09 | Local Economy | 20 | **P1/P2** | ↔ FR-12, FR-35 |
| 10 | Hospitality | 23 | **P1** | ↔ FR-17 |
| 11 | Smart Transport | 28 | **P1** | ↔ FR-18 |
| 12 | Sustainability | 20 | **P2** | ↔ FR-23 |
| 13 | Accessibility | 22 | **P0 overlay / P1 full** | ↔ FR-22 |
| 14 | Financial Intelligence | 20 | **P2** | ↔ FR-24 |
| 15 | Gamification | 21 | **P2/P3** | ↔ FR-27 |
| 16 | Social Tourism | 20 | **P2** | ↔ FR-28 |
| 17 | Privacy & Trust | 20 | **P0** | ↔ FR-37 |
| 18 | Government Intelligence | 26 | **P0** | ↔ FR-32 |
| 19 | Emergency Management | 20 | **P0** | ↔ FR-06 |
| 20 | Travel Management | 20 | **P1** | No direct FR domain — Blueprint-only addition (booking/wallet/journal features) |
| 21 | Group & Family | 16 | **P2** | ↔ FR-25 |
| 22 | Smart Ticketing | 18 | **P1** | ↔ FR-16 |
| 23 | Food Intelligence | 20 | **P2** | ↔ FR-19 |
| 24 | Anti-Scam & Fraud | 19 | **P1** | ↔ FR-15 |
| 25 | Incident Management | 20 | **P0** | ↔ FR-20 |
| 26 | Lost & Found | 11 | **P2** | ↔ FR-21 |
| 27 | Virtual Tourism | 11 | **P3** | No direct FR domain — Blueprint-only addition |
| 28 | Digital Twin | 14 | **P3** | ↔ FR-34 |
| 29 | Tourism Analytics | 18 | **P1/P2** | ↔ FR-39 |
| 30 | Advanced / Future | 20 | **P3 by definition** | The Blueprint's own explicit future domain |

## The frozen P0 vertical slice (what actually gets built first)

Cross-referencing every P0 row above against the three independent build-order sources
(Technology Stack Phase 1, System Design "NOW - SIH MVP" column, API Design's P0
endpoint set) yields one coherent, non-overlapping vertical slice — not a "feature
zoo":

1. **Account & identity** (FR-01) — register/login/OTP, roles
2. **AI travel planning** (FR-02) — AI travel agent, itinerary generation, replanning
3. **Destination discovery** (FR-03) — search, attraction detail, safety/crowd view
4. **Safe-route navigation** (FR-04 core) — spatial-engine-computed safe/crowd-free routes
5. **Tourist safety** (FR-05) — one-tap SOS, trusted contacts, safety check-ins
6. **Emergency & incident management** (FR-06, FR-20) — SOS lifecycle, incident triage, dispatch
7. **Offline resilience** (FR-07 core) — local queue, local SOS acknowledgement, sync
8. **Crowd awareness (minimal)** (FR-08 core) — enough live crowd/risk data to feed route scoring and destination safety view
9. **Notifications** (FR-36) — SOS/crowd/incident alert delivery
10. **Government/authority intelligence** (FR-32) — live map, incident/SOS dashboard
11. **Accessibility overlay** (FR-22 core) — WCAG-aligned critical-flow accessibility (SOS, navigation)
12. **Cross-cutting: Privacy & Trust (FR-37) and Security (FR-42)** — P0 at every layer per NFR, not a separate feature to schedule but a constraint on all of the above

Full per-item traceability for this slice: [05-traceability-matrix-mvp.md](05-traceability-matrix-mvp.md).

---

*Next: [05-traceability-matrix-mvp.md](05-traceability-matrix-mvp.md).*
