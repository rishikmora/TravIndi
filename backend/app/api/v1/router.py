"""Top-level /api/v1 router — Phase 8 API contracts.

Every route below either (a) genuinely queries the database (destination
discovery, crowd views — public, no auth needed, backed by real Phase 7
tables) or (b) is an honest 501 "NOT_IMPLEMENTED_YET" contract stub whose
request/response schemas, path, and OpenAPI docs are real but whose
implementation depends on a later phase (auth, AI, GIS, SOS dispatch, sync,
notifications). See each router module's docstring for which.
"""

from fastapi import APIRouter

from app.api.v1 import admin, analytics, authority, jobs, notifications, sync
from app.domains.booking.router import router as bookings_router
from app.domains.booking.router import tickets_router
from app.domains.business.router import guides_router, services_router
from app.domains.business.router import router as businesses_router
from app.domains.crowd.router import router as crowd_router
from app.domains.emergency.router import router as sos_router
from app.domains.financial.router import router as financial_router
from app.domains.gamification.router import router as gamification_router
from app.domains.group_travel.router import router as group_travel_router
from app.domains.identity.router import auth_router, users_router
from app.domains.knowledge.router import router as ai_content_router
from app.domains.location_sharing.router import router as location_sharing_router
from app.domains.lost_found.router import router as lost_found_router
from app.domains.safety.router import router as incidents_router
from app.domains.social.router import router as social_router
from app.domains.tourism.router import router as destinations_router
from app.domains.travel.router import ai_router, routes_router, trips_router
from app.domains.trust.router import router as trust_router

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(destinations_router)
api_router.include_router(trips_router)
api_router.include_router(ai_router)
api_router.include_router(ai_content_router)
api_router.include_router(routes_router)
api_router.include_router(incidents_router)
api_router.include_router(sos_router)
api_router.include_router(crowd_router)
api_router.include_router(businesses_router)
api_router.include_router(guides_router)
api_router.include_router(services_router)
api_router.include_router(trust_router)
api_router.include_router(bookings_router)
api_router.include_router(tickets_router)
api_router.include_router(sync.router)
api_router.include_router(notifications.router)
api_router.include_router(authority.router)
api_router.include_router(analytics.router)
api_router.include_router(jobs.router)
api_router.include_router(gamification_router)
api_router.include_router(lost_found_router)
api_router.include_router(financial_router)
api_router.include_router(group_travel_router)
api_router.include_router(location_sharing_router)
api_router.include_router(social_router)
api_router.include_router(admin.router)
