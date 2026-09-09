# TravIndi Backend

FastAPI modular monolith. Domain modules under `app/domains/` mirror the 14 confirmed
PostgreSQL schemas — see
[../docs/00-planning/09-database-schema-plan.md](../docs/00-planning/09-database-schema-plan.md).

## Structure

```
app/
  main.py            FastAPI app instance
  core/config.py      Settings (env-driven)
  db/                 SQLAlchemy async engine/session, declarative Base
  api/v1/router.py    Top-level /api/v1 router — domain routers mount here
  domains/            One package per DB schema (identity, tourism, travel, safety,
                      emergency, crowd, business, booking, payment, trust, knowledge,
                      analytics, integration, governance) — models/schemas/routers/
                      services added per-domain starting Phase 7-10
  core/security.py    Keycloak JWT verification (Phase 9)
  core/opa.py         OPA policy client (Phase 9)
  core/keycloak_client.py  Login/refresh proxy to Keycloak (Phase 9)
  core/ai/            AI Gateway, Model Router, RAG retrieval, guardrails (Phase 12)
  core/notify.py      In-app notification side effects (Phase 14)
  domains/travel/planner.py  The trip-planner agent itself (Phase 12)
  domains/travel/routing.py  Safe-route cost function (Phase 13, prototype depth)
  policies/           reserved for OPA-adjacent app-side policy helpers, if any emerge
  events/             Internal domain events (unused so far — SosEvent/IncidentEvent
                      tables serve this role directly instead)
  websocket/          Not built — SOS/authority views poll instead of pushing (Phase
                      14/16, prototype-depth call)
  workers/            Background workers — not built (async job dispatch stays a
                      Phase 14 501 stub; the AI planner and safe-router both run
                      synchronously instead, matching the NFR's ≤5s target)
alembic/              DB migrations
tests/                unit / integration / e2e
```

Phase 7: SQLAlchemy models + migrations exist for the 8 P0 schemas (44 tables) — see
`app/domains/*/models.py`. P1+ schemas (business, booking, payment, trust, analytics,
integration) exist in Postgres but have no models/tables yet. Phase 10: real Auth &
Users, Travel (trip CRUD). Phase 12: real AI trip planner. Phases 13/14/16 (+ partial
15): real safe routing, SOS/incident lifecycles, trusted-contact tokens, in-app
notifications, and the authority dashboard — all at *prototype depth* per the
2026-09-07 strategic pivot (see root [../README.md](../README.md) "Status" and
[../docs/00-planning/07-implementation-roadmap.md](../docs/00-planning/07-implementation-roadmap.md)
for exactly what "prototype depth" means per feature). See each router's module
docstring for what's real vs. still a 501 stub, and what's simplified vs. full depth.

## Two database roles — read this before touching `DATABASE_URL`

The app **never** connects as the Postgres superuser/table-owner role. Two roles exist
(`infra/postgres/02-app-role.sh`):

- `travindi` — DDL owner, superuser (Postgres image default). Used **only** by Alembic
  (`MIGRATIONS_DATABASE_URL`). Bypasses Row-Level Security entirely — never point the
  running app at this role, or RLS becomes a no-op.
- `travindi_app` — non-superuser, no table ownership. Used by the app at runtime
  (`DATABASE_URL`). RLS is genuinely enforced for this role (verified: a session with
  no `app.current_user_id`/`app.user_role` set can't read or write the 5
  RLS-protected tables at all — see `alembic/versions/*_row_level_security_*.py`).

**Phase 9 wired this up for real**: use `app.api.deps.get_rls_session` (not bare
`get_db_session`) for any route touching `identity.users`/`user_profiles`/
`trusted_contact_access_tokens`, `safety.incidents`, or `emergency.sos_requests`. It
depends on `get_current_principal` and runs `SELECT set_config('app.current_user_id',
..., true)` / `set_config('app.user_role', ..., true)` before yielding the session —
`SET LOCAL` itself doesn't accept bind parameters at the protocol level, `set_config()`
is the parameterized equivalent. Routes that don't use `get_rls_session` still get
fail-closed behavior against those 5 tables by design, not by accident.

## Authentication & Authorization (Phase 9)

Requires the `full` Docker Compose profile (Keycloak + OPA, on top of the always-on
postgres/redis/minio):

```bash
cd ../infra && cp .env.example .env && docker compose --profile full up -d
```

Keycloak imports `infra/keycloak/realm-export.json` automatically on first boot
(realm `travindi`, the 9 confirmed roles, two clients, three test users —
`test-tourist` / `test-police` / `test-admin`, all password `Test1234!`). This only
happens on a **fresh** container — `docker compose down -v` + `up` again if you edit
the realm export and need it reimported.

```bash
# Get a token through our own API (proxies to Keycloak):
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test-tourist@example.com", "password": "Test1234!"}'

# Use it:
curl http://localhost:8000/api/v1/users/me -H "Authorization: Bearer <access_token>"
```

`app/core/security.py` verifies signature (via Keycloak's JWKS, cached), issuer, and
audience, then extracts exactly one recognized realm role — zero or multiple matches
fail closed (`NO_APPLICATION_ROLE` / `AMBIGUOUS_ROLE`), never guessed.
`app/core/opa.py` is the separate authorization decision layer — it calls OPA's REST
API (`infra/opa/policies/travindi/authz.rego`, which encodes the confirmed
[role-permission matrix](../docs/00-planning/08-role-permission-matrix.md)) and fails
closed if OPA itself is unreachable. Identity and authorization are deliberately two
different modules — "who is this" is never conflated with "may they do this."

`/auth/register` is now real too (Phase 10): it calls Keycloak's Admin API as the
`travindi-backend` service account (`client_credentials` grant — a distinct service
identity, never a user's own token; see `app/core/keycloak_admin.py`) to create the
Keycloak user and assign the realm role, then writes the matching
`identity.users`/`user_profiles` rows as the `service` RLS role (no principal exists
yet at registration time). `/auth/otp/verify` stays 501 — genuinely unscheduled, not
just deferred: none of the 7 spec documents ever define how an OTP challenge gets
created (no "request OTP" endpoint exists anywhere), so this needs its own design pass
before it can be built, not just an implementation slot.

**Keycloak gotcha, hit twice:** a newly-created user (via Admin API or realm-export
seeding) needs `firstName`/`lastName` set, or Keycloak's declarative user profile
(default-on since KC 24+) silently attaches a required action that direct-grant login
can't satisfy — the failure surfaces later, at login, as the unhelpful
`"Account is not fully set up"`, not at user-creation time. `create_user()` sets
placeholder values since our API never collects a name at registration.

## AI / RAG trip planner (Phase 12)

`app/domains/travel/planner.py` is the agent; `app/core/ai/` is the AI Gateway (API-key
config-error checks, real token/cost tracking via `price_usage`), Model Router (one
Anthropic route today), guardrails (schema re-validation + prompt-injection isolation
via `wrap_untrusted`), and RAG (`rag.py`) — hand-rolled, not LlamaIndex/LangChain: the
actual scope is one embedding call + one pgvector `cosine_distance` query, which a
framework would only wrap for no benefit at this scale (see
`../docs/00-planning/03-assumption-register.md` C2, resolved 2026-09-07).

**Two providers, deliberately.** Generation is Anthropic Claude (`ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL`, default `claude-sonnet-5`). Embeddings run **locally** via
`sentence-transformers` (`EMBEDDING_MODEL_NAME`, default
`sentence-transformers/all-MiniLM-L6-v2`, 384-dim) — no API key, no cost, the model
weights download once (cached under `~/.cache`) on first use. This wasn't the original
plan: `knowledge.knowledge_chunks.embedding` was migrated at Phase 7 as `Vector(1536)`
sized for OpenAI's `text-embedding-3-small`, and Phase 12 was implemented against that
assumption first. When no OpenAI (or Anthropic's recommended Voyage AI) key turned out
to be available, embeddings moved to `sentence-transformers` instead — a genuine
mid-implementation pivot, not the original design. That changed the dimension to 384,
which needed migration `6852ab4c8e58` to resize the column (drop+recreate, since the
table had never held real data yet — if it ever does, resizing needs re-embedding every
row, not just a column change).

**Setup, in order:**
```bash
alembic upgrade head                 # applies the 384-dim embedding column
python -m app.db.seed                # destinations + attractions (no AI dependency)
python -m app.db.seed_knowledge      # embeds 3 destinations' knowledge (local model,
                                      # first run downloads weights — no API key needed)
```
Then `ANTHROPIC_API_KEY` must be set in `.env` for the planner itself to work — a
missing key surfaces as a clean `AI_NOT_CONFIGURED` 500, never a silent no-op.

**Guardrails are structural, not just prompted.** The planner fetches the real
candidate attractions for the given `destination_id` from the DB *before* calling
Claude, lists only those in the prompt, and — after the response comes back —
independently checks every returned `attraction_id` against that same candidate set;
one that isn't there is a hard `AI_OUTPUT_INVALID` (502), never silently dropped or
accepted. `destination_id` is functionally required: there's no destination-inference
from free text, because guessing the wrong destination and confidently planning around
it would be worse than a clear `NO_CANDIDATE_ATTRACTIONS` (422) error.

**Reading an itinerary back** (added while wiring the web UI): `GET
/trips/{trip_id}/itinerary` returns the latest version — until this existed, the only
way to see a generated itinerary was the direct response of trip-plan/generate/replan,
so navigating away and back had no way to show it again. `ItineraryItemOut` also
gained `attraction_name` (a batch-queried lookup in `_to_itinerary_out`) since
`attraction_id` alone isn't human-readable without a second round trip per item.

**Traceability.** Every planning call writes a real `knowledge.ai_sessions` +
`ai_messages` (user prompt, assistant summary) + `ai_tool_calls` (real input/output
token counts and computed USD cost) + `ai_predictions` (model version; `confidence` is
left `null` — Claude's tool-use response carries no calibrated confidence score, and
inventing one would be exactly the kind of fabrication this project avoids elsewhere).

## SOS, incidents, safe routing, notifications, authority dashboard (Phases 13/14/16)

Built in one pass on 2026-09-07 under a strategic pivot from "one fully-verified phase
at a time" to "a working SIH prototype covering every frozen P0 feature" — see root
[../README.md](../README.md) "Status" for the full rationale. Real, live-verified
end-to-end (browser + pytest), with infra-heavy pieces deliberately replaced by
lighter genuinely-working equivalents rather than stubbed:

- **SOS** (`app/domains/emergency/router.py`): real state machine (`CREATED` →
  `ACKNOWLEDGED` → `RESOLVED`/`FALSE_ALARM`, plus owner `CANCELLED`). `POST /sos`
  issues a real one-time token per registered trusted contact
  (`identity.trusted_contact_access_tokens`, migrated at Phase 7) — no real SMS
  channel exists (Assumption C6), so the raw token comes back in the response instead
  of being "sent." `POST /sos/{id}/trusted-contact/verify` is public (no login — a
  trusted contact never gets a platform account) and genuinely validates the token
  (hash lookup, expiry, revocation, single-use); precise location is only revealed
  once an `otp_code` is supplied, and since no real OTP channel exists either, any
  non-empty code satisfies that step-up — documented, not hidden.
- **Incidents** (`app/domains/safety/router.py`): same real lifecycle shape
  (`REPORTED` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED`/`FALSE_ALARM`/`CANCELLED`).
  `assign` self-assigns the acting police/responder principal rather than routing to
  an arbitrary target officer — a documented simplification.
- **Safe routing** (`app/domains/travel/routing.py`): real PostGIS query
  (`ST_DWithin` against a real `ST_GeogFromText` line) scoring real nearby open
  incidents and real nearby crowd risk, weighted per mode (`SAFE`/`CROWD_FREE`/
  `ACCESSIBLE`/`EMERGENCY`). Geometry is a straight line — no OSRM/GraphHopper/Valhalla
  was stood up (Assumption C1 deliberately deferred, not resolved); "along the route"
  is a fixed 3km corridor buffer. `confidence` is 0.8 when real crowd data was found
  nearby, 0.5 otherwise — derived from data availability, never a fabricated constant.
- **Notifications** (new `identity.notifications` table + `app/core/notify.py`):
  real in-app rows created as a side effect of SOS/incident authority actions — no
  real push/SMS delivery worker exists (Assumption C6). `GET/PUT
  /notifications/preferences` reads/writes the existing (Phase 7, previously unused)
  `user_profiles.notification_preferences` JSONB column.
- **Authority dashboard** (`app/api/v1/authority.py`): real aggregate counts (active
  SOS, open incidents, high-risk crowd cells ≥0.7) via `get_rls_session` — plain
  `get_db_session` would silently under-count everything here (see the RLS gotcha
  below). Access is a direct role check against exactly the roles the RLS read
  policies grant visibility to (`authority_police`, `authority_emergency_responder`,
  `authority_tourism_dept`, `authority_platform_admin`, `service`) — narrower than a
  blanket "any `authority_*` role," since e.g. `authority_municipality` would pass a
  looser check but see zero rows anyway.
- **Offline sync** (`app/api/v1/sync.py`): narrow real support — a
  `"sos"`/`"CREATE"` operation genuinely creates an SOS, idempotent on
  `operation_id` (checked against `SosEvent` payloads). Every other `entity_type` is
  honestly returned in `skipped_operation_ids`, never faked as acknowledged.
- **Demo seed data**: `python -m app.db.seed` now also seeds one `CrowdCell` +
  `SafetyScore` per destination (`model_version="seed-demo-v1"`, clearly not real
  telemetry/model output) so routing/dashboard/destination views have real signal to
  compute against instead of legitimately-empty results.

**RLS gotcha found and fixed while building this** (migration `91fa82c5074b`): Phase
7's RLS policies cast `current_setting('app.current_user_id', true)::uuid` directly,
assuming an unset GUC reads back as `NULL`. That only holds for a connection that has
*never* had the GUC touched. Once a pooled connection has run one `get_rls_session`
request, PostgreSQL reverts the GUC to the empty string `''` (not `NULL`) after that
transaction ends, for the rest of that physical connection's life — verified directly:
```sql
SELECT set_config('app.current_user_id', 'abc', true); COMMIT;
-- next transaction on the same connection:
SELECT current_setting('app.current_user_id', true);  --> '' , not NULL
```
`''::uuid` raises `invalid input syntax for type uuid`. This stayed latent since every
prior RLS-touching code path always called `get_rls_session` first (re-setting both
GUCs every request) — the authority dashboard's intentionally-unscoped-until-role-check
aggregate queries were the first plain read to hit a "tainted" pooled connection. Fixed
by wrapping the cast in `NULLIF(..., '')` (fail-closed semantics unchanged — `NULL`
still fails every equality check). If you add a new RLS policy, use `NULLIF(
current_setting('app.current_user_id', true), '')::uuid`, never the bare cast.

Also: never call `session.refresh(row)` on an RLS-protected row *after* `session.commit()`
— the commit ends the transaction the RLS GUCs were scoped to, so the refresh's SELECT
runs with the (now-tainted-empty, not unset) GUCs and can 500. Refresh *before* commit
instead (see `create_sos`/`create_incident`) — `TimestampMixin`'s `eager_defaults`
already covers `updated_at` on plain UPDATEs without needing a refresh at all.

## Business directory, trust (verification/reviews/fraud), AI Tourist Guide, Translation — P1 feature-gap pass

Built 2026-09-08 in response to the full SIH feature catalog ask: "build the real P1
tier, skip P2/P3" (see root [../README.md](../README.md) "Status" for the full scope
decision and the explicit P2/P3 exclusion list — hardware/IoT, trained CV/forecasting
models, vendor-contract integrations, blockchain/AR/digital-twin infra are none of them
faked here). New schemas: `business` (`app/domains/business/models.py`) and `trust`
(`app/domains/trust/models.py`), migration `b94e38113e8f`.

- **Business/Guide directory** (`app/domains/business/router.py`, `/businesses`,
  `/guides`): self-owned directory data, no real hotel/taxi/guide vendor feed exists
  (same posture as Assumption C6/C7) — businesses and guides are created by their own
  `business`/`guide`-role principals through this app's own endpoints. `is_verified` is
  denormalized and read-only from the outside; it only ever flips via the verification-
  approval path below.
- **Verification** (`app/domains/trust/router.py`, `/trust/verifications`): wires up
  the `authority_verifier` role and `verification` OPA resource type that existed since
  Phase 9 but were never connected to a real endpoint. `submit` resolves the real
  business/guide owner from the DB and passes it to `require_allowed` (mirrors
  `_get_incident_or_404` → `require_allowed` in `app/domains/safety/router.py`) — never
  trusts a client-supplied owner claim. `approve` issues a real `trust.credentials` row
  and flips the subject's `is_verified` flag; documents are metadata-only (no upload
  endpoint exists yet, same honest gap as `safety.incident_evidence`).
- **Reviews** (`/trust/reviews`) and **fraud cases** (`/trust/fraud-cases`): neither
  resource was in the frozen P0 OPA matrix (`docs/00-planning/08-role-permission-matrix.md`
  §3 explicitly defers them), so `review`/`fraud_case` resource types were added to
  `infra/opa/policies/travindi/authz.rego` in this pass — reviews follow "read open to
  anyone, write by the author" (same as public destination content); fraud cases follow
  the exact shape of the confirmed "Incident report" row (reporter RW own,
  police/tourism_dept/platform_admin RU+dispatch). **If you change the rego file, you
  must restart the `opa` container** (`docker compose restart opa` from `infra/`) — it
  loads `/policies` once at startup with no `--watch` flag, so edits are invisible to a
  running server until it restarts.
- **AI enrichment is always best-effort**: fake-review authenticity scoring and
  fraud-signal triage (`app/domains/trust/moderation.py`, real Claude tool-use calls)
  are wrapped in `try/except AppError` at the call site — a missing
  `ANTHROPIC_API_KEY` or a transient AI failure never blocks the review/fraud-report
  write itself, which is the real user-facing action. Neither ever auto-actions a
  review or case (no auto-remove, no auto-status-change) — the score/signal is
  attached for a human moderator, consistent with "AI recommends, policy decides."
  Real `knowledge.ai_predictions` rows are written for traceability
  (`prediction_type="review_authenticity"`/`"fraud_signal"`).
- **AI Tourist Guide** (`app/domains/knowledge/guide.py`, `POST /ai/guide/ask`, FR-10):
  reuses the trip planner's exact RAG pipeline (`app/core/ai/rag.py`) but answers a
  free-text question directly — plain-text Claude response, no tool schema. Grounded
  only in retrieved `knowledge.knowledge_chunks`; told to say "not enough information"
  rather than answer from general knowledge if nothing relevant is retrieved (a
  travel-safety app cannot afford an ungrounded guess about customs/safety/logistics).
  No voice I/O (needs speech infra — P2, excluded) and no multi-turn memory (stateless
  per question, same as the planner).
- **Translation** (`app/domains/knowledge/translation.py`, `POST /ai/translate`,
  `POST /ai/translate/image`, FR-11): real Claude text translation and real Claude
  *vision* translation for a photographed menu/signboard — one model call reads and
  translates the image, no separate OCR service. Voice-to-voice and fully offline
  translation both need speech/on-device-model infrastructure this project doesn't
  have — excluded, documented, not faked.

## Booking + ticketing — Round 2 (2026-09-08)

Real time-slot booking against a real availability slot, with a real DB-verifiable
QR ticket — no external ticketing/payment vendor, no real payment (a booking is
confirmed immediately, as if payment always succeeded; `payment.*` stays unbuilt, same
honest gap as before). New schema `booking` (`app/domains/booking/models.py`),
migration `6ed7f205ad5c`.

- **No separate `availability_slots` table.** `business.availability` (already built
  in the P1 pass above) models exactly the same concept — a service's bookable
  capacity window. The source PDFs list "availability" under both the business and
  booking domain boxes without ever resolving that as a duplicate; building a second,
  functionally identical table would just split one piece of mutable state
  (`booked_count`) across two rows that could drift out of sync. `booking.bookings.
  availability_id` references `business.availability.id` directly. Two new endpoints
  were needed to make this usable at all: `POST/GET /services/{id}/availability` (the
  owner opens a time slot; anyone can browse it) — a real gap in the earlier pass,
  which built the `Availability` model but never exposed it over the API.
- **Bookings** (`app/domains/booking/router.py`, `POST/GET /bookings`,
  `GET /bookings/business/{id}`, `POST /bookings/{id}/cancel`): validates real
  remaining capacity (`capacity - booked_count`) before confirming, a hard 409
  `SLOT_FULL` otherwise. Cancelling restores the slot's capacity and voids the ticket.
  `total_amount` is display-only bookkeeping (service price × party size) — genuinely
  never charged anywhere.
- **Tickets** (`POST /tickets/verify`): a real offline-verifiable check-in — a plain
  DB lookup by the token encoded in the ticket's QR code, no live payment/vendor API
  call needed. Restricted to the owner of the business the underlying service belongs
  to, via the same generic `self` OPA resource type used everywhere else in this
  domain (no new OPA resource type needed — `require_allowed(action="write",
  resource_type="self", owner_id=<real business owner from the DB>)`).
- **Deliberately not built**, to avoid half-finished infrastructure: virtual queue (a
  live position-in-line concept needing real-time state this prototype doesn't track)
  and multi-attraction/tourist passes (a genuinely different multi-entity product
  surface). Both are real P1 Smart Ticketing sub-features per the feature catalog, but
  a booking here is a single time-slot reservation, nothing more.
- Web (`web/`): a real "vibe" redesign of every travel-facing page (new coral/teal
  design system in `globals.css`, redesigned Home/Destinations/Trips/Businesses/
  Guides/Login/Register) plus new booking UI — a real scannable QR ticket
  (`qrcode` npm package, rendered from the same token the backend verifies), a booking
  flow on the business detail page, a "My bookings" page, and a business-owner
  check-in panel. Verified live end-to-end in two browser sessions (business owner +
  tourist): registered a business, added a service and a time slot, booked it as a
  tourist, got a real QR ticket, and checked it in as the owner — capacity correctly
  went from 2/2 to 1/2 open and the booking flipped to `COMPLETED`.
- **Real bugs found while verifying live, not just via pytest**: (1) `create_business`
  accessed the lazy `business.profile` relationship after `session.commit()` with a
  bare `session.refresh(business)` — `MissingGreenlet` in this async context; fixed
  with `attribute_names=["profile"]`. (2) `list_businesses` ordered by `Business.name`
  — once enough test businesses accumulated across sessions, a freshly created one
  could fall off the first page alphabetically; changed to `created_at.desc()`,
  matching every sibling "list" endpoint's convention. (3) The dev backend server has
  no `--reload` flag (`.claude/launch.json`) — newly registered routers need a manual
  restart to take effect, which briefly looked like a 404 routing bug during this
  round's own live verification.
- 91/91 backend tests pass (4 new for booking — capacity enforcement, cancel-restores-
  capacity, check-in ownership, business-owner list scoping), ruff clean, mypy clean
  on every file touched this round. Web `tsc`/`eslint` both clean.

## Accessibility, predictive tourism, tourism analytics — Round 3 (2026-09-08)

No new schema — every piece here is either a new query over existing tables or an API
finally exposed on top of a table that already existed. Real data throughout;
"predictive" is explicitly a labeled heuristic, never a trained model (matching the
excluded-P2/P3 stance on crowd-forecasting ML from the P1 pass).

- **Accessibility facilities** (FR-22 full domain): `tourism.facilities` — migrated
  since Phase 7 but never given a router/schema until now, a real gap like the P1
  pass's `authority_verifier` role. `GET /destinations/{id}/facilities` is public
  (accessibility infrastructure — elevators, ramps, accessible toilets/parking, first
  aid, information desks — needs to be visible to every visitor);
  `POST /destinations/{id}/facilities` is gated to `authority_tourism_dept`/
  `authority_platform_admin` via a direct role check (a plain eligibility check, no
  ownership column exists on `Facility` for OPA's `self` type to express — same
  reasoning as `create_business`/`create_guide`'s role gates).
- **Accessibility preferences** (`PUT/GET /users/me/accessibility-preferences`): writes
  into the existing `user_profiles.accessibility_preferences` JSONB column — already
  read by `/users/me` since Phase 10 but never had a write endpoint. A small fixed
  shape (`high_contrast`/`large_text`/`reduce_motion`), not an open-ended dict like
  notification preferences, since the whole point is a known set of UI toggles the web
  app applies as real CSS (`web/src/app/globals.css`'s `[data-a11y-*]` selectors) —
  genuinely changes contrast/font-size/motion site-wide, not just a stored-but-unused
  setting.
- **Predictive tourism demand forecast** (FR-33, `GET /destinations/{id}/demand-forecast`):
  real heuristic aggregation, `method: "heuristic_v1"` always in the response so no
  caller mistakes it for a calibrated ML prediction. Three genuinely forward-looking
  counts from real rows: planned visits in the next 30 days (`travel.itinerary_items`
  scheduled at this destination's attractions), confirmed bookings in the next 30 days
  (`booking.bookings` for this destination's businesses), and 7-day planning momentum
  (itinerary items *created* recently, any schedule date — a proxy for rising
  interest). No trained forecasting model exists or is implied.
- **Tourism analytics** (FR-39, `app/api/v1/analytics.py`, `GET /analytics/overview` +
  `GET /analytics/trending-destinations`): real aggregate counts (businesses/guides
  verified vs. total, trips, bookings by status, review count + average authenticity,
  open fraud cases) and a real "trending destinations" ranking (itinerary items created
  in the last 7 days, grouped by destination). Distinct from `authority.py`'s
  SOS/incident dashboard — this is the tourism/business side neither that endpoint nor
  anything else covers. Gated to `authority_tourism_dept`/`authority_platform_admin`,
  same direct-role-check reasoning as the existing authority dashboard.
- Web: a real accessibility settings page (`/accessibility`) that visibly changes the
  site (verified live: toggled high-contrast, watched the whole app repaint pure
  black/yellow, confirmed it survives navigation); a Facilities section + role-gated
  "Add facility" form and a "Planning activity" heuristic tile on the destination
  detail page; a new `/authority/analytics` dashboard linked from the command center.
- 95/95 backend tests pass (4 new), ruff clean, mypy clean (one new pre-existing-style
  `Result.rowcount` mypy note on the new endpoint, matching the exact same accepted
  pattern already used by `revoke_consent` in the same file). Web `tsc`/`eslint` clean.
  Verified live: added a real facility as `test-admin@example.com`, watched analytics
  reflect real counts (businesses, bookings, trending destinations by real planning
  activity), and confirmed the demand-forecast numbers on India Gate's page.

## Lovable frontend bridge + booking N+1 fix (2026-09-08)

- `cors_allowed_origins` (`app/core/config.py`) gained `http://localhost:5173` —
  the Lovable-generated frontend, adapted to run locally as a plain Vite SPA in
  `../web-lovable/` (see that directory's README) while Lovable's own hosted
  editor is blocked on credits. Verified live: a real account registered and
  logged in against this backend from that app (`POST /auth/register` → 201,
  `POST /auth/login` → 200), not mocked.
- **Real N+1 found and fixed**: `list_bookings`/`list_business_bookings`
  (`app/domains/booking/router.py`) called `_to_booking_out` in a Python loop,
  and each call did up to 4 sequential queries (service, business,
  availability, ticket) — a 20-row page could issue up to 80 round trips.
  Added `_to_booking_outs_batch`, which fetches each of those four in one
  `WHERE id IN (...)` query regardless of list size, and a shared
  `_build_booking_out` pure-construction function so the single-row
  (`_to_booking_out`) and batch paths can't drift apart. 95/95 tests still
  pass, ruff/mypy clean.

## Richer demo data (2026-09-08)

So the demo doesn't look sparse with only 3 destinations and no business/trust/booking
activity:

- `app/db/seed.py` gained 7 more real destinations (Taj Mahal, Dashashwamedh Ghat/
  Varanasi, Amber Fort, Khajuraho, Hampi, Golden Temple, Meenakshi Amman Temple/
  Madurai) with real attractions, plus `tourism.facilities` rows (wheelchair
  ramps/accessible toilets/elevators/first-aid posts) for all 10 destinations —
  Round 3's accessibility feature had no seed data until now.
- `app/db/seed_knowledge.py` gained one real, general, publicly-known editorial
  paragraph per new destination (same "no fabricated statistics" rule as the
  original 3), so the AI Tourist Guide's RAG retrieval has something to find for
  all 10, not just the original 3.
- New `app/db/seed_demo.py`: 5 businesses (hotel/tour operator/restaurant/artisan/
  taxi) across 5 of the new destinations, each with a service + availability
  slots; 3 guides; a deliberately mixed verification queue (3 approved, 1
  pending, 1 rejected business; 2 approved, 1 pending guide) going through the
  exact same approve/reject state changes `trust/router.py` performs (real
  `Credential` rows, `is_verified` only flipped on approval); 8 reviews and 3
  fraud reports that call the real `app/domains/trust/moderation.py` functions
  (genuine Claude API calls — one review is deliberately generic/superlative-
  heavy and scored 0.25 authenticity with real `generic_language`/
  `excessive_superlatives` flags, versus 0.90+ for the genuine ones — not
  fabricated to look differentiated); 3 bookings + tickets. All demo accounts
  (5 business owners, 3 guides, 3 tourists, 1 `authority_verifier`) are
  provisioned through the real Keycloak Admin API + local `identity.users` rows,
  same as a real `/auth/register` would produce — password `Test1234!` for all,
  matching the existing `test-tourist`/`test-police`/`test-admin` convention.
  Added `get_user_id_by_email` to `app/core/keycloak_admin.py` (small addition,
  same client pattern as `create_user`) so the script can look up an
  already-provisioned demo account instead of failing on a 409 when re-run.
  Verified live end-to-end: logged in as the new `tourist.demo1@travindi-demo.in`
  account against the running API and confirmed the businesses list shows the
  intended verified/pending/rejected mix (`GET /businesses`), not just DB rows.

## Local setup

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
cp .env.example .env       # then point DATABASE_URL/REDIS_URL/MIGRATIONS_DATABASE_URL at the infra/ compose stack
uvicorn app.main:app --reload
```

Verify: `GET http://localhost:8000/healthz` and `GET http://localhost:8000/api/v1/health`.

## Tests

```bash
pytest
```

`tests/unit/` never touches the database (routes needing DB access are either
genuinely public — no auth dependency — or return 401/403 before any DB dependency
resolves) and needs no `.env` at all. `tests/integration/` requires the live infra
stack (`docker compose --profile full up -d`, from `infra/`) + a seeded database
(`python -m app.db.seed`). `tests/integration/test_ai_planner.py` additionally needs
`ANTHROPIC_API_KEY` set and `python -m app.db.seed_knowledge` run first — it makes real
Claude API calls, so it's slower and (very slightly) costs money to run, unlike the
rest of the suite. `tests/integration/test_sos_and_incidents.py` covers the Phase
13/14/16 SOS/incident/routing/notifications/authority-dashboard prototype — it seeds a
local `identity.users` row for the Keycloak fixture `test-police@example.com` user
directly (mirroring `test_rls_session.py`'s own fixture-setup pattern), since nothing
in this build provisions a local row for pre-seeded Keycloak authority users — a real
gap this note flags rather than hides.

**Do not use Starlette's `TestClient` for anything that calls out over the network
from inside a route handler** (Keycloak, OPA — most of Phase 9/10). It deadlocks:
`TestClient` runs the app on an anyio portal *thread*, and a handler that itself opens
a second `httpx.AsyncClient` for a real outbound call can hang that thread
indefinitely. It's intermittent by shape of the code, not by luck of timing —
`/auth/login` (one outbound call) happened to work every time; `/auth/register`
(several chained outbound calls: admin token, create user, look up role, assign role)
hung every time. `TestClient` even prints "Using httpx with starlette.testclient is
deprecated" on every use — that warning was foreshadowing exactly this.

The fix (and the actual pattern now used throughout `tests/`): the shared `client`
fixture in `tests/conftest.py` yields a real `httpx.AsyncClient` wired to the app via
`ASGITransport`, and every test is `async def`. This runs the whole request on the
*same* event loop as the test — no second thread, no deadlock, and it's also faster.
`pyproject.toml`'s `asyncio_default_test_loop_scope = "session"` keeps that one loop
alive for the whole run, which is also why `app/db/session.py`'s lru_cache'd async
engine now binds correctly and consistently everywhere — no more per-test
cache-clearing workaround needed.

## SQLAlchemy async gotchas (found in Phase 10, fixed at the root)

1. **Always use `DateTime(timezone=True)` explicitly — SQLAlchemy's bare `Mapped[datetime]`
   does not default to it.** A plain `Mapped[datetime]` column maps to Postgres
   `TIMESTAMP WITHOUT TIME ZONE`; passing a timezone-aware Python `datetime` (e.g.
   `datetime.now(UTC)`, which every write path in this codebase uses per the
   confirmed UTC convention) into that column raises `asyncpg.DataError: can't
   subtract offset-naive and offset-aware datetimes`. This bug existed on ~42 columns
   across every domain until the `303878c86348` migration fixed it — if you add a new
   datetime column, write `mapped_column(DateTime(timezone=True), ...)`, never a bare
   `Mapped[datetime]`.
2. **Server-computed `onupdate`/`server_default` values need `eager_defaults`, or
   accessing them after a commit crashes.** Without it, a column like
   `updated_at`'s `onupdate=func.now()` is merely marked "expired" after the UPDATE
   flushes — SQLAlchemy doesn't know the value Postgres actually computed. Accessing
   it afterward (e.g. serializing the object into a response body) triggers an
   implicit lazy-refresh query, but by that point you're back in plain sync Python,
   not inside the async greenlet bridge, so it fails with
   `MissingGreenlet: greenlet_spawn has not been called`. Fixed globally via
   `__mapper_args__ = {"eager_defaults": True}` on `TimestampMixin`
   (`app/db/mixins.py`) — every model using it gets the value fetched via `RETURNING`
   as part of the same statement instead of deferred.

## Config / CORS gotcha (found in Phase 11, fixed at the root)

**`Settings`' `env_file` must be an absolute path resolved from `config.py`'s own
location, not the default relative `".env"`.** Pydantic-settings resolves a relative
`env_file` against the process's current working directory, not the file that declares
`Settings`. That's invisible when you always launch with `backend/` as cwd, but
`uvicorn app.main:app --app-dir backend` from the repo root (any process manager,
systemd unit, or containerized `CMD` array shaped that way) leaves cwd at the repo root
— the relative `.env` silently resolves to nothing and every required field fails
Pydantic validation. Fixed in `app/core/config.py`:
`_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"`. `app/main.py`
also added `CORSMiddleware` for the Phase 11 frontend dev servers
(`cors_allowed_origins` in `Settings`) with a `try`/`except ValidationError` fallback to
the field's default — so importing the app for pure unit tests still needs no `.env`.

## Migrations

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

Two things autogenerate does **not** handle correctly for this project — check every
new migration by hand for both:

1. **GeoAlchemy2 spatial indexes.** Every `Geography`/`Geometry` column auto-creates
   its own GIST index (`idx_<table>_<column>`) when the table is created. Autogenerate
   also renders an explicit `op.create_index(...)` for the same index because it shows
   up as a diff — remove that duplicate `create_index`/`drop_index` pair, or `upgrade()`
   fails with "relation already exists."
2. **Enum type cleanup on downgrade.** `op.drop_table()` does not drop the PostgreSQL
   `ENUM` type created alongside it — a `downgrade()` followed by `upgrade()` fails with
   "type already exists" unless you add explicit `DROP TYPE IF EXISTS schema.enum_name`
   statements at the end of `downgrade()` (see `3c27907ea6bb_initial_p0_schema.py` for
   the pattern).

Also missing from autogenerate: `import geoalchemy2` / `import pgvector.sqlalchemy` —
already added to `alembic/script.py.mako` so future migrations get them for free. The
flip side: the template adds *both* unconditionally, so a migration that only needs
one of them (or neither — e.g. a plain `CREATE TABLE` or an `ALTER POLICY`) will fail
`ruff check` on the unused import; just delete the one(s) you don't use.

## Seeding

```bash
python -m app.db.seed
```

Idempotent, safe to re-run. Deliberately separate from migrations. Runs as
`app.user_role = 'service'` so it isn't blocked by RLS. On Windows, always let the
script reach its own `await engine.dispose()` before exit — leaving asyncpg
connections to be garbage-collected at interpreter shutdown has been observed to
segfault the process (asyncpg 0.31 + Python 3.11's Proactor loop); this doesn't affect
correctness, only clean exit, but Phase 10's FastAPI lifespan shutdown should dispose
the engine explicitly for the same reason.

```bash
python -m app.db.seed_knowledge   # Phase 12 — embeds each destination's knowledge text
```

Separate from the script above because it needs a local embedding model loaded (no API
key, but the first run downloads `all-MiniLM-L6-v2`'s weights) — kept out of the main
seed script so that one stays instant and dependency-light. Also idempotent (skips any
destination it's already embedded a document for).

```bash
python -m app.db.seed_demo   # richer demo data — run after the two above
```

Adds 5 businesses, 3 guides, a real approve/pending/reject mix of verifications, 8
reviews with genuine Claude-scored authenticity analysis, 3 fraud reports with genuine
Claude triage classification, and a few bookings/tickets — see
"Richer demo data" below. Needs `ANTHROPIC_API_KEY` and the Keycloak admin service
account configured (same env as the running API), since it provisions real accounts
through the Keycloak Admin API and makes real Claude calls. Idempotent; safe to re-run.
