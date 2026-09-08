from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import install_exception_handlers
from app.core.middleware import RequestIdMiddleware

app = FastAPI(
    title="TravIndi API",
    description="SIH 26204 — AI-powered smart travel & tourism / tourist-safety platform",
    version="0.1.0",
)

try:
    _cors_origins = get_settings().cors_allowed_origins
except ValidationError:
    # get_settings() requires DATABASE_URL/REDIS_URL/S3_* to be set, which
    # pure-unit tests deliberately don't set (app/db/session.py's lazy
    # get_engine() is the whole point — see its docstring). CORS origins
    # have a default regardless; fall back to it here so importing the app
    # never requires a full .env just to read one field with a default.
    _cors_origins = Settings.model_fields["cors_allowed_origins"].default

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)
install_exception_handlers(app)
app.include_router(api_router)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    """Liveness probe — does not touch the database."""
    return {"status": "ok"}
