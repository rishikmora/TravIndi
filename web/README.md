# TravIndi Web

Public/tourist-facing web app. Stack (confirmed):
[Next.js 16 (App Router) + TypeScript + Tailwind CSS v4](../docs/00-planning/01-project-master-model.md#i-technology-stack).

Scaffolded in Phase 11 (Frontend foundations) via `create-next-app`, against the real
backend (`../backend`). Extended on 2026-09-07 to cover safety-domain screens (SOS,
trusted contacts, incident reports, notifications, safe-route scoring, authority
dashboard) as part of a strategic pivot to "a working SIH prototype covering every
frozen P0 feature," then extended again the same day to close the remaining gaps
(AI trip planning UI, consent management, trusted-contact verification landing page)
— see `../README.md` "Status" and
[../docs/00-planning/07-implementation-roadmap.md](../docs/00-planning/07-implementation-roadmap.md)
for the phase plan and what "prototype depth" means per feature.

## What's real vs. stubbed

Live against the backend:
- Register / login / logout (Keycloak-backed)
- Destination discovery (list + detail + attractions + safety score + crowd risk) —
  public, server-rendered
- Trip CRUD (create, list, detail) and **AI trip planning**: `/trips/plan` ("plan me a
  trip" from a prompt — creates the trip too), and on `/trips/[id]`, "Generate an
  itinerary" for a plain trip or "Replan" once one exists. A real Anthropic call end
  to end, grounded in real seeded attractions — not mocked.
- **SOS** (`/sos`): one-tap trigger (real geolocation, falls back to a fixed point),
  live status, cancel, trusted-contact **links** (not just raw tokens) issued and
  shareable directly (no real SMS channel exists yet, so this prototype shows what
  would otherwise be texted out)
- **Trusted-contact verification** (`/verify?sos=<id>&token=<token>`): the public,
  unauthenticated landing page the links above point to — a trusted contact never
  gets an account. Shows coarse SOS status by default; entering any "verification
  code" (no real OTP channel exists) reveals the precise location.
- **Trusted contacts** (`/trusted-contacts`): add/list/remove
- **Incident reports** (`/report`): submit, see status
- **Notifications** (`/notifications`): list, mark read — populated by real backend
  side effects (e.g. an authority acknowledging your SOS creates a real row here)
- **Privacy & consent** (`/consents`): grant/revoke consent records, each its own row
  (never a hidden checkbox). Purpose options are suggestions tied to this app's real
  data uses — no source document names a confirmed purpose taxonomy (it's a free-text
  backend column), so a custom "Other" purpose is offered too.
- **Safe-route scoring** (`/routes`): public form, calls the real (prototype-depth,
  straight-line-corridor) PostGIS scorer and shows the actual score/reasons/confidence
- **Authority command center** (`/authority`): real dashboard counts + SOS/incident
  lists with acknowledge/resolve/assign actions — gated server-side to authority
  roles; log in as `test-police@example.com` / `Test1234!` (Keycloak fixture user) to
  see it populated

**Added 2026-09-08 (P1 feature-gap pass)** — see `../backend/README.md`'s matching
section for the backend side of each of these:
- **Business directory** (`/businesses`, `/businesses/[id]`): browse, register (if
  logged in as a `business`-role account), post services and reviews, submit for
  verification (owner-only) and see the live status.
- **Guide directory** (`/guides`): browse, register (if logged in as a `guide`-role
  account), submit for verification.
- **Verification queue** (`/authority/verifications`): approve/reject pending
  business/guide KYC submissions. No `authority_verifier` Keycloak fixture user
  exists yet — log in as `test-admin@example.com` (`authority_platform_admin`
  bypasses every OPA policy check, same code path) to exercise this in this demo.
- **Fraud & scam reports** (`/trust/fraud`): report a case, see a real Claude-
  generated triage signal attached automatically, and (if you hold an investigative
  authority role) confirm/dismiss any case — otherwise you only see your own reports.
- **AI Tourist Guide** (`/ai/guide`): ask a destination-scoped question, answered by a
  real Claude call grounded only in the seeded knowledge base, with cited sources.
- **Translate** (`/ai/translate`): real Claude text translation, plus a real Claude-
  vision photo-to-translation flow for a menu/signboard image.

**Added 2026-09-08 (Round 2 + "vibe" redesign)**:
- **Booking**: on `/businesses/[id]`, an owner can add a bookable service and open a
  time slot; anyone logged in can book an open slot and gets a real QR ticket
  (`qrcode` npm package, rendered from the same token `POST /api/v1/tickets/verify`
  checks — not a decorative image). `/bookings` ("My bookings") lists your bookings
  with the ticket and a cancel action. The business detail page also gets an
  owner-only check-in panel (paste a ticket's token, mark it used) and a live booking
  list for that business.
- **Visual redesign**: a new coral/teal design system (`src/app/globals.css` — see its
  own comment for the palette rationale) replaces the earlier plain black/white
  utility look across Home, Destinations, Trips (list/plan/detail), Businesses,
  Guides, Login, and Register. New `src/components/icons.tsx` (hand-rolled inline SVG
  icons — no icon package pulled in for a handful of glyphs) and a redesigned `Nav`
  (sticky, active-link highlighting, a "More" dropdown for secondary links so the bar
  doesn't overflow with 14+ links).

**Added 2026-09-08 (Round 3)**:
- **Accessibility** (`/accessibility`): real toggles (high contrast, large text,
  reduce motion) — `src/lib/accessibility-context.tsx` applies them as
  `data-a11y-*` attributes on `<html>`, which `globals.css` turns into real CSS
  overrides (a true black/yellow high-contrast palette, `font-size: 118%`, and
  `animation-duration`/`transition-duration` forced to near-zero site-wide). Persists
  to `localStorage` immediately and to the backend once logged in — verified live:
  toggling high contrast repaints the whole app instantly and survives navigation.
- **Facilities**: a destination page's "Accessibility & facilities" section lists
  real elevator/ramp/accessible-toilet/parking/first-aid records
  (`tourism.facilities`, migrated since Phase 7 but never exposed until now); an
  inline add-form appears for `authority`-account-type users (the backend enforces
  the actual `authority_tourism_dept`/`authority_platform_admin` gate).
- **Planning activity** tile on the destination page: a real heuristic
  (`method: "heuristic_v1"`) — planned visits, confirmed bookings, and recent planning
  momentum, all from real trip/booking data, never a trained forecast.
- **`/authority/analytics`**: a real tourism operations dashboard (businesses/guides
  verified vs. total, bookings by status, review authenticity, open fraud cases,
  trending destinations) — linked from the Authority command center.

Not yet built: offline support, refresh-token-on-401 retry.

Known follow-ups:
- `src/lib/auth-context.tsx` does not yet retry with the stored refresh token on a 401 —
  an expired access token just forces a fresh login.
- Two browser tabs on this app share `localStorage` (same origin) — logging in as a
  different role in a second tab silently swaps the session in the first tab too on
  its next navigation. Fine for this prototype's manual testing; would need per-tab
  session isolation (or just testing sequentially in one tab) to avoid confusion.
- `src/lib/auth-context.tsx`'s `token`/`loading` state deliberately does NOT use a lazy
  `useState(() => ...)` initializer reading `localStorage`, even though an ESLint rule
  (`react-hooks/set-state-in-effect`) suggests exactly that "fix" for the effect that
  sets initial auth state — doing so reads a client-only API during this "use client"
  component's server-render pass, diverging server/client initial state and breaking
  hydration (hit this for real; reverted). The one remaining `setLoading(false)` call
  in that effect's early-return branch carries a targeted, explained
  `eslint-disable-next-line` instead. If you hit this same rule elsewhere, prefer
  restructuring the effect to call `.then()/.catch()` directly (or via a named
  callback function, not a named *async function invoked bare from the effect* — the
  rule flags that shape specifically) rather than reaching for a lazy initializer,
  unless you're certain the initial value is server/client-consistent (e.g. derived
  from `useSearchParams()`, which `/verify`'s loading state does use safely).

## Running locally

Requires the backend running on `http://localhost:8010` (see `../backend/README.md`) and
its Keycloak/OPA/Postgres dependencies up (`../infra`). For the safety-domain screens
to show real data, also run the backend's `python -m app.db.seed` (destinations,
attractions, and demo crowd/safety signals).

```bash
cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE_URL
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/lib/api.ts` — typed client for the backend's `{data}`/`{error}` envelope
- `src/lib/auth-context.tsx` — token storage (`localStorage`) + `useAuth()`
- `src/components/Nav.tsx`, `RequireAuth.tsx` — persistent nav bar, client-side route guard
- `src/app/` — routes: `/`, `/login`, `/register`, `/destinations`, `/destinations/[id]`,
  `/trips`, `/trips/new`, `/trips/plan`, `/trips/[id]`, `/sos`, `/verify`,
  `/trusted-contacts`, `/report`, `/notifications`, `/consents`, `/routes`, `/authority`
