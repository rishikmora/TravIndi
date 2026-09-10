# Deployment

Two independent pieces:

1. **`web/`** (Next.js) → **Vercel**.
2. **`backend/`** (FastAPI) + **Keycloak** + **OPA** → a single VPS, via
   `infra/docker-compose.prod.yml` + Caddy for automatic HTTPS. Postgres is
   already external (Supabase — see `docs/00-planning` / project memory on
   the Supabase migration), so the VPS never runs a database.

Deploy the backend first — the frontend needs its HTTPS URL as a build-time
env var.

## Why not all-on-Vercel

Vercel's serverless functions can't host this backend as-is:
`sentence-transformers` pulls in `torch` (hundreds of MB, well past
Vercel's function size limit), and the app depends on Keycloak and OPA —
long-running services, not stateless functions. Postgres (Supabase) is the
one piece that *was* already Vercel-compatible in spirit (it's already a
managed external service), which is why only the app server itself needs a
real host.

## 1. Backend + Keycloak + OPA (VPS)

Any small VPS works (a $5-6/mo box is plenty — this is a modular monolith,
not a cluster). You need: Docker + the Compose plugin installed, and a
domain name with an A/AAAA record pointing at the VPS's IP (Caddy needs a
real hostname to get a Let's Encrypt certificate — a bare IP can't have
one). No domain yet? A free wildcard like `<vps-ip>.sslip.io` resolves to
the IP and works fine as a stand-in.

```bash
git clone <this-repo> && cd travindi
cp infra/.env.example infra/.env      # fill in real values, especially API_DOMAIN
cp backend/.env.example backend/.env  # fill in real values (see below)
```

**`backend/.env` for production** — same file the app already reads
locally, three things change from the local-dev example:

- `DATABASE_URL` / `MIGRATIONS_DATABASE_URL` → your Supabase connection
  strings (Session Pooler, `travindi_app` / `travindi_migrator` roles) —
  **not** the `localhost` values in `.env.example`, those are only for a
  from-scratch local Postgres.
- `CORS_ALLOWED_ORIGINS` → your Vercel URL(s), comma-separated is fine:
  `https://travindi.vercel.app,http://localhost:3000`. Vercel preview
  deployments get their own throwaway `*.vercel.app` URL per branch — add
  one explicitly here if you need a preview build to reach the API too.
- `KEYCLOAK_URL` / `OPA_URL` → leave whatever's in the file; `infra/
  docker-compose.prod.yml` overrides both to the compose-internal service
  names (`http://keycloak:8080`, `http://opa:8181`) automatically.

`REDIS_URL`/`S3_*` can stay as the placeholder example values — grep
confirms nothing in `app/` actually reads them yet (declared for a
not-yet-built future feature); any value satisfies `Settings`.

Then bring everything up:

```bash
cd infra
docker compose -f docker-compose.prod.yml up -d --build
```

This starts `backend` (built from `backend/Dockerfile`), `keycloak` and
`opa` (**never published to the internet** — the backend is their only
caller; browsers never talk to either directly), and `caddy` (the only
container with published ports, 80/443 — it terminates TLS and reverse-
proxies to `backend:8000`, requesting the Let's Encrypt cert for
`API_DOMAIN` automatically on first boot).

Verify:

```bash
curl https://<API_DOMAIN>/healthz          # {"status":"ok"}
curl https://<API_DOMAIN>/api/v1/destinations   # real Supabase data
```

The image itself was built and smoke-tested locally while writing this
(real `/healthz`, a real `/api/v1/destinations` Supabase read, a real
Keycloak login producing a valid JWT, and a real OPA-gated
`/api/v1/trust/fraud-cases` read) — not just a clean build.

**If your database schema is ever ahead of what Supabase has** (a new
migration was written but not yet applied), run once from any machine that
can reach Supabase:

```bash
cd backend && alembic upgrade head
```

This isn't run automatically on container boot on purpose — with more than
one backend replica, concurrent auto-migration on every boot is a real
footgun; a deliberate one-time step is safer.

**Security note before real users touch this**: `infra/keycloak/
realm-export.json` (committed to the repo, since local dev needs the auto-
import) bakes in a demo client secret
(`backend-service-secret-change-me-locally`) for the `travindi-backend`
service account. Fine for a hackathon demo; rotate it (Keycloak admin
console → Clients → travindi-backend → Credentials → regenerate, then
update `KEYCLOAK_ADMIN_CLIENT_SECRET` in `backend/.env` to match) before
this holds real user data.

### Redeploying after a code change

```bash
cd infra && docker compose -f docker-compose.prod.yml up -d --build backend
```

### Alternative: Render/Fly/Railway instead of a bare VPS

`backend/Dockerfile` builds standalone, so any of these can deploy it
directly as a web service with zero changes, and each gives you automatic
HTTPS for free (no Caddy needed there). You'd still need to run Keycloak +
OPA as additional (ideally *private*/internal, not publicly exposed)
services on the same platform, pointing the backend's `KEYCLOAK_URL`/
`OPA_URL` at whatever internal hostname that platform gives private
services. This is a reasonable path but **not the one verified above** —
the VPS + `docker-compose.prod.yml` + Caddy route was actually built and
tested end-to-end for this project; the exact private-networking hostname
syntax on a given PaaS should be checked against that platform's current
docs before relying on it.

## 2. Frontend (Vercel)

This is a monorepo — `web/` isn't the repo root — so when importing the
repo into Vercel:

1. **New Project → Import** this repo.
2. **Root Directory** → set to `web`. Framework preset auto-detects Next.js
   from there; no `vercel.json` needed.
3. **Environment Variables** → add
   `NEXT_PUBLIC_API_BASE_URL = https://<API_DOMAIN>` (the backend from
   step 1, HTTPS — a plain `http://` backend URL will be blocked as mixed
   content by browsers once the frontend is served over Vercel's HTTPS).
4. **Deploy.**

Once you have the real Vercel URL, go back and add it to the backend's
`CORS_ALLOWED_ORIGINS` (step 1) and restart the backend — until you do,
the browser console will show CORS errors even though the API itself is
reachable.

`web/.env.local.example` documents the same variable for local dev.
