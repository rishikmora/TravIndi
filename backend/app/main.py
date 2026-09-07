from fastapi import FastAPI

from app.api.v1.router import api_router

app = FastAPI(
    title="TravIndi API",
    description="SIH 26204 — AI-powered smart travel & tourism / tourist-safety platform",
    version="0.1.0",
)

app.include_router(api_router)


@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    """Liveness probe — does not touch the database."""
    return {"status": "ok"}
