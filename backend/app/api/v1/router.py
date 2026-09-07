"""Top-level /api/v1 router.

Domain routers are mounted here as they're implemented (Phase 8 onward) — e.g.
`api_router.include_router(auth_router, prefix="/auth", tags=["auth"])`. Only a
health check exists for now.
"""

from fastapi import APIRouter

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
