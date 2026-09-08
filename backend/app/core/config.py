from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolved relative to this file, not the process's current working
# directory: pydantic-settings' default `env_file=".env"` only works when
# the process happens to be launched with backend/ as its cwd. Running
# uvicorn with `--app-dir backend` from the repo root (e.g. from
# .claude/launch.json, or any other tooling that cd's elsewhere first)
# keeps the cwd at the repo root, so a relative ".env" silently resolves to
# nothing and every field falls through to "required, missing."
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"

    database_url: str
    """Runtime app connection — must use the non-superuser `travindi_app`
    role (infra/postgres/02-app-role.sh) so Row-Level Security actually
    applies. Never point this at the migration-owner role."""

    migrations_database_url: str | None = None
    """DDL owner connection used by Alembic (app/db/../../alembic/env.py).
    Falls back to `database_url` if unset, but that combination cannot run
    migrations against a database with RLS-restricted DDL grants — set this
    explicitly in any environment where `database_url`'s role lacks DDL
    privileges (which is the case as soon as infra/postgres/02-app-role.sh
    has run)."""

    redis_url: str

    s3_endpoint_url: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str

    # Optional so importing the app / running DB-only tests never requires
    # these — but app/core/security.py raises a clear config error (not a
    # silent bypass) if a route actually needs auth and they're unset.
    keycloak_url: str | None = None
    keycloak_realm: str | None = None
    keycloak_public_client_id: str = "travindi-app"
    """The public OIDC client mobile/web use — also used by the backend's
    own /auth/login and /auth/token/refresh proxy endpoints
    (infra/keycloak/realm-export.json)."""

    keycloak_admin_client_secret: str | None = None
    """Secret for `travindi-backend`'s service account (client_credentials
    grant), used only for Keycloak Admin API calls (user provisioning on
    /auth/register) — a separate service identity from any user's own
    token, per docs/00-planning/01-project-master-model.md §M."""

    keycloak_audience: str | None = None
    """Expected `aud` claim — the travindi-backend client id, added to
    tokens via the audience-travindi-backend protocol mapper on
    travindi-app (infra/keycloak/realm-export.json)."""

    opa_url: str | None = None
    """Base URL of the OPA server (infra/docker-compose.yml `opa` service).
    Policy queried at `{opa_url}/v1/data/travindi/authz` — see
    infra/opa/policies/travindi/authz.rego."""

    cors_allowed_origins: list[str] = [
        "http://localhost:3000",  # web/ (Next.js dev server)
        "http://localhost:8081",  # mobile/ (Expo web dev server)
        "http://localhost:19006",  # mobile/ (Expo web, classic port)
    ]
    """Phase 11 frontend dev servers. Not meant to be exhaustive for
    production — revisit alongside real deployment origins."""

    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5"
    """Model Router's (currently sole) route for the trip-planner agent.
    Verified against platform.claude.com/docs as a real, current Claude API
    model id (2026-09) — override via env if your account needs a different
    one. Optional/None so importing the app never requires it; app/core/ai/
    raises a clear config error (not a silent no-op) if a route that
    actually needs it is hit with no key configured."""

    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    """Embeds `knowledge.knowledge_chunks` (Phase 12) — local/self-hosted via
    the `sentence-transformers` package, not an API call: no embeddings key
    was available, and Anthropic has no embeddings API of its own (they
    partner with Voyage AI for that). 384-dim, which is why
    knowledge/models.py's EMBEDDING_DIM is 384, not the 1536 originally
    planned for an OpenAI-embeddings setup — see migration
    (Phase 12 dimension-change revision) for the column resize. No API key
    needed for this one; the model weights download once (cached under
    ~/.cache) on first use."""


@lru_cache
def get_settings() -> Settings:
    return Settings()
