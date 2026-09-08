"""Authority command center — FR-32. Real as of this build: aggregate counts
computed from live `emergency.sos_requests`/`safety.incidents`/
`crowd.crowd_cells` data, plus real list views (reusing the SOS/incident
list endpoints' own RLS-based role scoping — see
app/domains/emergency/router.py `list_sos`, app/domains/safety/router.py
`list_incidents`). Access is gated by a direct role check here rather than
a new OPA resource type: this is a read-only aggregate view with no
per-row ownership semantics for OPA's existing "self"/"sos"/"incident"
resource types to express — a documented simplification, not a bypass of
the real per-row checks those endpoints still enforce themselves.

Uses `get_rls_session`, not plain `get_db_session`: `sos_requests`/
`incidents` are FORCE-RLS tables, and a session with no principal-scoped
GUCs set sees zero rows under every policy branch (owner match, role
match, and service bypass all evaluate to NULL/false when the GUCs were
never set for this request) — the aggregate would silently under-count
everything, not "see everything" as a naive read might assume.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_rls_session
from app.core.errors import AppError
from app.domains.crowd.models import CrowdCell
from app.domains.emergency.models import SosRequest, SosStatus
from app.domains.safety.models import Incident, IncidentStatus
from app.schemas.common import DataResponse

router = APIRouter(prefix="/authority", tags=["authority"])

_HIGH_RISK_THRESHOLD = 0.7

_SOS_OPEN = [s for s in SosStatus if s not in (SosStatus.RESOLVED, SosStatus.CANCELLED, SosStatus.FALSE_ALARM)]
_INCIDENT_OPEN = [
    s for s in IncidentStatus if s not in (IncidentStatus.RESOLVED, IncidentStatus.CANCELLED, IncidentStatus.FALSE_ALARM)
]

# Exactly the roles the sos_requests_read/incidents_read RLS policies (see
# alembic/versions/b797776b9c1d_*.py) actually grant broad read access to,
# plus service/platform_admin (which bypass RLS entirely) — narrower than a
# blanket "any authority_* role", since e.g. authority_municipality or
# authority_verifier would pass a looser check but see zero rows anyway.
_DASHBOARD_ROLES = {
    "authority_police",
    "authority_emergency_responder",
    "authority_tourism_dept",
    "authority_platform_admin",
    "service",
}


class AuthorityDashboardOut(BaseModel):
    active_sos_count: int
    open_incident_count: int
    high_risk_cell_count: int


def _require_authority(principal: Principal) -> None:
    if principal.role not in _DASHBOARD_ROLES:
        raise AppError(
            code="FORBIDDEN", message="Only authority accounts can view the command center.", status_code=403
        )


@router.get("/dashboard", response_model=DataResponse[AuthorityDashboardOut])
async def get_dashboard(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[AuthorityDashboardOut]:
    _require_authority(principal)
    active_sos = (await session.execute(select(func.count(SosRequest.id)).where(SosRequest.status.in_(_SOS_OPEN)))).scalar_one()
    open_incidents = (
        await session.execute(select(func.count(Incident.id)).where(Incident.status.in_(_INCIDENT_OPEN)))
    ).scalar_one()
    high_risk_cells = (
        await session.execute(select(func.count(CrowdCell.id)).where(CrowdCell.risk_score >= _HIGH_RISK_THRESHOLD))
    ).scalar_one()
    return DataResponse(
        data=AuthorityDashboardOut(
            active_sos_count=active_sos, open_incident_count=open_incidents, high_risk_cell_count=high_risk_cells
        )
    )
