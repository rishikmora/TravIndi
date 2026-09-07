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
  policies/           OPA integration (Phase 9)
  events/             Internal domain events (Phase 14+)
  websocket/          WebSocket channels (Phase 14+)
  workers/            Background workers — sync, notifications, AI jobs (Phase 14+)
alembic/              DB migrations (Phase 7 authors the first real revision)
tests/                unit / integration / e2e
```

Nothing beyond a health check is implemented yet — this is Phase 6 scaffolding.

## Local setup

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
cp .env.example .env       # then point DATABASE_URL/REDIS_URL at the infra/ compose stack
uvicorn app.main:app --reload
```

Verify: `GET http://localhost:8000/healthz` and `GET http://localhost:8000/api/v1/health`.

## Tests

```bash
pytest
```

## Migrations (from Phase 7 onward)

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```
