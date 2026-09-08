# TravIndi — SIH 26204

AI-powered smart travel & tourism / tourist-safety platform for India. Built from the
7 SIH 26204 specification documents; see [docs/00-planning/](docs/00-planning/) for
the full reconciled requirements, architecture, and decision record before touching
any code here.

## Status

**Strategic pivot (2026-09-07):** the user redirected the build from "one fully-verified
phase at a time" to "a working SIH prototype covering every frozen P0 feature, at
prototype depth where full depth isn't needed to demo it." Phases 13 (GIS/routing), 14
(Safety/SOS), 15 (offline sync — partial), and 16 (authority dashboard) were built in
one pass under that directive, after Phase 12 (AI/RAG) completed under the original
fully-verified approach. Depth call made explicitly, not silently: infra-heavy pieces
(a real road-network routing engine, a WebSocket push stack, a full generic sync
engine) were replaced with lighter-but-genuinely-working equivalents — documented
per-feature below and in each module's own docstring — rather than stubbed or faked.

**AI/RAG (Phase 12) — done, full depth.** Real Anthropic Claude (`claude-sonnet-5`)
trip planner, hand-rolled RAG over pgvector (no LlamaIndex/LangChain — Assumption C2
overridden after being surfaced to the user), local `sentence-transformers` embeddings
(no OpenAI/Voyage key was available). Three real endpoints: `POST /ai/trip-plan`,
`POST /ai/itinerary/generate`, `POST /ai/itinerary/{id}/replan`. Guardrails are real
(hallucinated attraction ids are a hard 502; no-destination requests fail closed with
422); full traceability into `knowledge.ai_sessions/ai_messages/ai_tool_calls/
ai_predictions` with real token counts and computed cost.

**Safety/SOS, routing, authority dashboard (Phases 13/14/16 + partial 15) — done,
prototype depth.** Real, live-verified (browser + pytest) end-to-end:
- **SOS**: real state machine (CREATE → ACKNOWLEDGE → RESOLVE/FALSE_ALARM, plus owner
  CANCEL), real trusted-contact token issuance/verification (no real SMS/OTP channel —
  Assumption C6 gap — so tokens are returned directly and any non-empty OTP code
  satisfies the step-up check), real in-app notifications fired on authority response.
- **Incidents**: same real lifecycle (report → assign → escalate → resolve).
- **Safe routing**: a real, live-queried PostGIS cost function (haversine distance +
  nearby open incidents + nearby crowd risk) — deliberately a straight-line corridor,
  not a road-network engine (OSRM/GraphHopper/Valhalla, Assumption C1, was never
  stood up — that's real infra a prototype doesn't need to demo the safety-routing
  *behavior*). Never LLM-generated geometry, per the project's own spatial rule.
- **Authority dashboard**: real aggregate counts (active SOS, open incidents,
  high-risk crowd cells) plus real SOS/incident list-and-act views (acknowledge/
  resolve/assign), gated to authority roles.
- **Offline sync**: narrow real support — a `"sos"`/`"CREATE"` sync operation
  genuinely creates an SOS, idempotent on `operation_id`; every other entity type is
  honestly reported as skipped, not faked. A generic sync engine wasn't built.
- A real, previously-latent RLS bug was found and fixed while building this: Phase 7's
  `current_setting(...)::uuid` cast broke on a pooled connection that had been touched
  by an RLS-aware request before (reverts to `''`, not `NULL`) — fixed with `NULLIF`.
- Frontend (web): SOS button, trusted contacts, notifications, incident report form,
  the safe-route scorer, and the authority command center are all real, clickable
  pages — not just backend endpoints. Verified live in two browser sessions (tourist +
  police) end to end: SOS created → acknowledged by police → tourist received the
  real notification.
- 67/67 backend tests pass (pytest + ruff clean).

Not built anywhere: real push/SMS delivery (Assumption C6, no vendor picked), a
real road-network routing engine (Assumption C1, still open), WebSocket real-time
channels for SOS/authority (`/ws/sos/{id}`, `/ws/authority/{id}` — polling instead),
async job dispatch for slow AI plans, and mobile-app parity for any of this session's
new safety features (mobile still only has Phase 11's auth/destinations/trips).

**Web feature-gap pass (2026-09-08, web-only per user direction).** Closed the three
remaining gaps in `web/`: a real **AI trip planning UI** (`/trips/plan`, `/trips/[id]`
generate/replan — backed by a new `GET /trips/{id}/itinerary` endpoint and an
`attraction_name` field added to `ItineraryItemOut` so results are readable without a
second lookup), a real **consent management UI** (`/consents` — no backend work
needed, Phase 10's endpoints were already real), and a real **trusted-contact
verification landing page** (`/verify` — public/unauthenticated, reached via a real
shareable link now shown on `/sos` instead of a bare token). All three verified live
in-browser end to end, including a real Claude-generated itinerary and a real replan.
Found and reverted a real hydration bug caused by chasing a new ESLint rule
(`react-hooks/set-state-in-effect`) with a lazy `useState` initializer that read
`localStorage` during SSR — see `web/README.md` "Known follow-ups" for the correct
fix pattern. 68/68 backend tests pass; web `tsc`/`eslint` both clean.

**P1 feature-gap pass (2026-09-08).** User instruction: implement the full SIH feature
catalog for the prototype; when P2/P3 items (real hardware/IoT, trained CV/forecasting
models, vendor contracts, blockchain/AR/digital-twin infra) came up, the explicit
decision was **"build the real P1 tier, skip P2/P3"** — those are documented as
excluded per-feature, never faked with mock UI. New schemas `business` and `trust`
(migration `b94e38113e8f`), real endpoints, real web UI, all live-verified in-browser:
- **Business/Guide directory** — self-owned data (no real vendor feed exists for
  hotels/taxis/guides), `business`/`guide`-role principals register their own listings.
- **Verification** — wires up the `authority_verifier` role and `verification` OPA
  resource type that existed since Phase 9 but were never connected to a real endpoint;
  approval issues a real `trust.credentials` row and flips `is_verified`.
- **Reviews** and **fraud cases** — new `review`/`fraud_case` OPA resource types added
  to `infra/opa/policies/travindi/authz.rego` (not in the frozen P0 matrix, so modeled
  on the closest confirmed shape). Real Claude-based fake-review authenticity scoring
  and fraud-signal triage, always best-effort (never blocks the underlying write) and
  never auto-actioning — "AI recommends, policy decides."
- **AI Tourist Guide** (`POST /ai/guide/ask`) — reuses the trip planner's RAG pipeline
  for grounded, source-cited Q&A; **Translation** (`POST /ai/translate`,
  `POST /ai/translate/image`) — real Claude text and vision-based menu/signboard
  translation. Voice I/O, offline translation, and offline/mesh-networking-adjacent
  features are explicitly excluded (no speech/on-device-model infra).
- Backend: 87/87 tests pass (pytest + ruff + mypy clean), including 9 new
  integration tests making real Claude API calls. Web: `tsc`/`eslint` both clean,
  every new flow (register business → submit verification → approve → review with a
  real AI signal → fraud report with a real AI signal → AI guide answer → text
  translation) verified live in two browser sessions (business owner + admin).
- See `backend/README.md`'s matching section for the full per-feature breakdown,
  including the exact OPA-policy-restart gotcha this round surfaced (the `opa`
  container loads `/policies` once at startup — restart it after editing the rego).

**Booking/ticketing (Round 2) + web "vibe" redesign (2026-09-08).** User said
"continue" (into the next P1 round) "and also make the UI in travel vibe and user
friendly." New schema `booking` (migration `6ed7f205ad5c`) — real time-slot bookings
against the existing `business.availability` slots (no separate `availability_slots`
table; see `backend/README.md` for why) with a real DB-verifiable QR ticket. No real
payment gateway — a booking confirms immediately, `total_amount` is display-only
bookkeeping. New `POST/GET /services/{id}/availability` endpoints (a real gap in the
prior round: `Availability` had a model but no API). `POST /tickets/verify` is a real
offline check-in restricted to the business owner via the existing `self` OPA
resource type — no new policy needed. Deliberately not built: virtual queue and
multi-attraction/tourist passes (different, more complex product surfaces).

Web got a full visual redesign: a new coral/teal design system (`web/src/app/
globals.css`), a cleaner sticky nav, and a rebuild of Home/Destinations/Trips/
Businesses/Guides/Login/Register with cards, icons, and consistent spacing instead of
the earlier plain black/white utility look. New booking UI: a real scannable QR ticket
(`qrcode` npm package) rendered from the same token the backend verifies, a booking
flow on the business detail page, a "My bookings" page, and a business-owner check-in
panel. 91/91 backend tests pass (4 new), ruff+mypy clean; web `tsc`/`eslint` clean;
verified live end-to-end in two browser sessions (business owner + tourist) — register
business → add service + time slot → book as tourist → real QR ticket → owner checks
it in → capacity and status update correctly. Two real bugs found and fixed while
verifying live (not just via pytest): a lazy-relationship access crashing
`create_business` post-commit, and `list_businesses` ordering by name instead of
recency (could hide a freshly created business off the first page). See
`backend/README.md`'s matching section for the full breakdown.

**Accessibility, predictive tourism, tourism analytics (Round 3, 2026-09-08).** No new
schema — every piece is a new query over existing tables or an API finally exposed on
a table that already existed (real gaps, same category as the P1 pass's dormant
`authority_verifier` role). `tourism.facilities` (migrated since Phase 7, never had a
router) now has real endpoints: public reads, and tourism-authority-gated writes for
elevators/ramps/accessible toilets/parking/first aid. `user_profiles.
accessibility_preferences` (read since Phase 10, never writable) now has a real
`PUT` endpoint backing a real settings page that visibly changes the site — high
contrast, large text, reduced motion — not just a stored-but-unused value. A
"predictive tourism" demand-forecast endpoint reports real forward-looking counts
(planned visits, confirmed bookings, planning momentum) explicitly labeled
`heuristic_v1` — never a trained ML forecast, matching the same "no fake ML" stance
that excluded crowd-forecasting from the P1 tier. A new tourism analytics dashboard
(`/analytics/overview`, `/analytics/trending-destinations`) reports real aggregate
counts (businesses/guides verified vs. total, bookings by status, review authenticity,
open fraud cases, trending destinations by real planning activity) — the tourism/
business side neither the existing SOS/incident authority dashboard nor anything else
covers. 95/95 backend tests pass (4 new), ruff+mypy clean; web `tsc`/`eslint` clean;
verified live — toggled high contrast and watched the whole app repaint, added a real
facility, and confirmed the analytics dashboard reflects real counts (86 businesses,
187 trips, trending destinations correctly ranked). See `backend/README.md`'s
matching section for the full breakdown.

See [docs/00-planning/07-implementation-roadmap.md](docs/00-planning/07-implementation-roadmap.md)
for the full phase plan and [docs/00-planning/README.md](docs/00-planning/README.md)
for the frozen MVP scope, confirmed database schema plan, and role/permission matrix.

## Repository layout

```
backend/    FastAPI modular monolith (Python) — domain modules mirror the 14 confirmed DB schemas
mobile/     React Native + Expo tourist app (scaffolded in Phase 11)
web/        Next.js — public PWA, business/guide portal, authority command center (scaffolded in Phase 11)
infra/      Local dev infrastructure (Docker Compose: PostgreSQL/PostGIS/pgvector, Redis, MinIO always-on; Keycloak + OPA + Kong under --profile full)
docs/       Planning set (docs/00-planning) + architecture/API/DB docs added as they're built
```

## Local development

```bash
cd infra
cp .env.example .env
docker compose up -d
```

This starts PostgreSQL (with PostGIS + pgvector), Redis, and MinIO. Keycloak (auth,
realm auto-imported from `infra/keycloak/realm-export.json`) and OPA (authorization
policy, `infra/opa/policies/`) are needed from Phase 9 onward:

```bash
docker compose --profile full up -d
```

Kong stays deferred until there's a real gateway-routing need. See
[backend/README.md](backend/README.md) "Authentication & Authorization" for how to
get a test token.

Backend setup: see [backend/README.md](backend/README.md).

## Architecture at a glance

FastAPI modular monolith · PostgreSQL + PostGIS + pgvector · Redis · S3/MinIO ·
Keycloak + OIDC/OAuth 2.1 + RBAC/ABAC + OPA · React Native + Expo · Next.js.
AI recommends, policy decides, authorized humans control high-impact actions. Routing
is computed by a spatial engine, never generated by an LLM. Kafka / Kubernetes /
ClickHouse / digital twin are explicitly out of scope until Regional/National scale.

Full detail: [docs/00-planning/01-project-master-model.md](docs/00-planning/01-project-master-model.md).
