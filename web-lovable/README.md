# TravIndi — Lovable frontend (local bridge)

This is a **local, runnable copy** of the frontend being built in Lovable
(project "India Journey Hub"), adapted to run outside Lovable's hosted
sandbox while connected to the real TravIndi backend.

## Why this exists

The actual frontend is being built and iterated on in Lovable
(https://lovable.dev/projects/27b9dae7-d99d-4f20-bd48-e2c904953df5) via its
MCP integration — that project is the source of truth for ongoing frontend
work. Lovable's workspace ran out of free-tier credits partway through the
build. Rather than wait idle, this directory is a locally-runnable copy of
the same application code (routes, components, API client, auth) so it can
actually be used and demoed against the real backend right now. **Sync
changes back from Lovable here once credits are available again** — this is
a bridge, not a fork to maintain in parallel long-term.

## What's different from the Lovable project

Lovable scaffolded this as a **TanStack Start** (SSR) app using a
Lovable-sandbox-specific Vite plugin (`@lovable.dev/vite-tanstack-config`)
and a Cloudflare-targeted Nitro server build — infrastructure that's either
unavailable or unnecessary outside Lovable's own hosting. This copy strips
that down to a **plain client-rendered Vite SPA**:

- Dropped: `src/server.ts`, `src/start.ts`, TanStack Start, Nitro, the
  Lovable vite plugin, and Lovable's in-editor error-reporting hooks
  (`lib/error-capture.ts`, `lib/error-page.ts`, `lib/lovable-error-reporting.ts`).
- Kept unchanged: every route in `src/routes/`, every component in
  `src/components/`, `src/lib/api-client.ts`, `src/lib/auth.tsx`, the full
  design system in `src/styles.css`. This is the actual application code
  Lovable generated — not rewritten, just re-hosted on a simpler harness
  (`src/main.tsx` boots `RouterProvider` directly instead of an SSR shell).
- `src/components/ui/*` (shadcn/ui primitives) were reinstalled via
  `npx shadcn@latest add ...` rather than copied, to guarantee correct peer
  dependencies — they're stock, unmodified components either way.

## Running locally

Requires the backend running on `http://localhost:8010` (see
`../backend/README.md`) with its Postgres/Keycloak/OPA stack up
(`../infra`), same as `../web/`.

```bash
npm install
npm run dev
```

Open http://localhost:5173. `VITE_API_BASE_URL` (in `.env.local`) points at
the real backend — every API call is real, nothing here is mocked. If you
see "Could not reach the TravIndi API," check that the backend is actually
running and that `http://localhost:5173` is in `backend/app/core/config.py`'s
`cors_allowed_origins` (it is, as of this bridge's setup — the backend needs
a restart after any change there, it doesn't hot-reload).

## Status

Phase 1 + 2 of the Lovable build are here and verified working end-to-end
against the real backend: design system, app shell, navigation, and real
register/login (verified live — a real account was created via
`POST /api/v1/auth/register`, then real-logged-in via `POST /api/v1/auth/login`).
Every other route (`/destinations`, `/plan`, `/businesses`, `/trips`, `/sos`,
`/authority/*`, etc.) exists as a placeholder stub — Lovable's Phase 3+
prompts are queued and will fill these in once credits return; at that
point, pull the updated files from the Lovable project into this directory
the same way (or just keep using the Lovable-hosted preview directly).
