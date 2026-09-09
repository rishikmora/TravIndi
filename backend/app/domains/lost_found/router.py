"""Lost & Found — Feature Blueprint P2 domain #26. Real embedding-based
matching (see `app/domains/lost_found/engine.py`) between lost- and
found-item reports; a match is only ever a `SUGGESTED` row until the
reporter (or an authority helping them) confirms it — never auto-resolved.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal
from app.core.errors import AppError
from app.db.session import get_db_session
from app.domains.lost_found.engine import (
    embed_report_text,
    find_and_store_matches_for_found_item,
    find_and_store_matches_for_lost_item,
)
from app.domains.lost_found.models import (
    FoundItemReport,
    FoundItemStatus,
    LostFoundMatch,
    LostItemReport,
    LostItemStatus,
    MatchStatus,
)
from app.domains.lost_found.schemas import (
    FoundItemCreateIn,
    FoundItemOut,
    LostItemCreateIn,
    LostItemOut,
    MatchOut,
)
from app.domains.tourism.schemas import GeoPoint
from app.schemas.common import DataResponse, ListResponse

router = APIRouter(prefix="/lost-found", tags=["lost-found"])

# Same "plain role comparison, not an OPA resource" pattern already used for
# facility curation (app/domains/tourism/router.py) — authority staff helping
# reunite a tourist with a lost item is an eligibility check, not an
# ownership decision.
_AUTHORITY_ROLES = {"authority_police", "authority_platform_admin"}


def _to_geo_point(wkb_element: Any) -> GeoPoint | None:
    if wkb_element is None:
        return None
    point = to_shape(wkb_element)
    return GeoPoint(lon=point.x, lat=point.y)


def _to_lost_item_out(row: LostItemReport) -> LostItemOut:
    return LostItemOut(
        id=row.id, reporter_user_id=row.reporter_user_id, category=row.category, title=row.title,
        description=row.description, lost_at=row.lost_at, destination_id=row.destination_id,
        location=_to_geo_point(row.location), status=row.status, created_at=row.created_at,
    )


def _to_found_item_out(row: FoundItemReport) -> FoundItemOut:
    return FoundItemOut(
        id=row.id, finder_user_id=row.finder_user_id, category=row.category, title=row.title,
        description=row.description, found_at=row.found_at, destination_id=row.destination_id,
        location=_to_geo_point(row.location), storage_location=row.storage_location, status=row.status,
        created_at=row.created_at,
    )


@router.post("/lost-items", response_model=DataResponse[LostItemOut], status_code=201)
async def report_lost_item(
    body: LostItemCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[LostItemOut]:
    embedding = await embed_report_text(body.title, body.description)
    lost_item = LostItemReport(
        reporter_user_id=uuid.UUID(principal.user_id),
        category=body.category,
        title=body.title,
        description=body.description,
        lost_at=body.lost_at,
        destination_id=body.destination_id,
        location=f"SRID=4326;POINT({body.lon} {body.lat})" if body.lon is not None and body.lat is not None else None,
        embedding=embedding,
    )
    session.add(lost_item)
    await session.flush()
    await find_and_store_matches_for_lost_item(session, lost_item)
    await session.commit()
    await session.refresh(lost_item)
    return DataResponse(data=_to_lost_item_out(lost_item))


@router.get("/lost-items", response_model=ListResponse[LostItemOut])
async def list_lost_items(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[LostItemOut]:
    query = select(LostItemReport).order_by(LostItemReport.created_at.desc())
    if principal.role not in _AUTHORITY_ROLES:
        query = query.where(LostItemReport.reporter_user_id == uuid.UUID(principal.user_id))
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_lost_item_out(r) for r in rows])


@router.post("/found-items", response_model=DataResponse[FoundItemOut], status_code=201)
async def report_found_item(
    body: FoundItemCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[FoundItemOut]:
    embedding = await embed_report_text(body.title, body.description)
    found_item = FoundItemReport(
        finder_user_id=uuid.UUID(principal.user_id),
        category=body.category,
        title=body.title,
        description=body.description,
        found_at=body.found_at,
        destination_id=body.destination_id,
        location=f"SRID=4326;POINT({body.lon} {body.lat})" if body.lon is not None and body.lat is not None else None,
        storage_location=body.storage_location,
        embedding=embedding,
    )
    session.add(found_item)
    await session.flush()
    await find_and_store_matches_for_found_item(session, found_item)
    await session.commit()
    await session.refresh(found_item)
    return DataResponse(data=_to_found_item_out(found_item))


@router.get("/found-items", response_model=ListResponse[FoundItemOut])
async def list_found_items(session: AsyncSession = Depends(get_db_session)) -> ListResponse[FoundItemOut]:
    # Public browse of OPEN found items — someone who lost something should
    # be able to look without an automated match having fired for them.
    rows = (
        await session.execute(
            select(FoundItemReport).where(FoundItemReport.status == FoundItemStatus.OPEN).order_by(FoundItemReport.created_at.desc())
        )
    ).scalars().all()
    return ListResponse(data=[_to_found_item_out(r) for r in rows])


async def _get_lost_item_for_principal(session: AsyncSession, lost_item_id: uuid.UUID, principal: Principal) -> LostItemReport:
    lost_item = await session.get(LostItemReport, lost_item_id)
    if lost_item is None:
        raise AppError(code="LOST_ITEM_NOT_FOUND", message="No such lost item report.", status_code=404)
    if principal.role not in _AUTHORITY_ROLES and str(lost_item.reporter_user_id) != principal.user_id:
        raise AppError(code="FORBIDDEN", message="You can only view your own reports.", status_code=403)
    return lost_item


@router.get("/lost-items/{lost_item_id}/matches", response_model=ListResponse[MatchOut])
async def list_matches_for_lost_item(
    lost_item_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[MatchOut]:
    lost_item = await _get_lost_item_for_principal(session, lost_item_id, principal)
    rows = (
        await session.execute(
            select(LostFoundMatch)
            .where(LostFoundMatch.lost_item_id == lost_item.id)
            .order_by(LostFoundMatch.similarity_score.desc())
        )
    ).scalars().all()
    out = []
    for match in rows:
        found_item = await session.get(FoundItemReport, match.found_item_id)
        assert found_item is not None, "found_item_id is a NOT NULL FK — the referenced row always exists"
        out.append(
            MatchOut(
                id=match.id, lost_item=_to_lost_item_out(lost_item), found_item=_to_found_item_out(found_item),
                similarity_score=float(match.similarity_score), status=match.status, created_at=match.created_at,
            )
        )
    return ListResponse(data=out)


async def _get_match_for_principal(session: AsyncSession, match_id: uuid.UUID, principal: Principal) -> LostFoundMatch:
    match = await session.get(LostFoundMatch, match_id)
    if match is None:
        raise AppError(code="MATCH_NOT_FOUND", message="No such match.", status_code=404)
    lost_item = await session.get(LostItemReport, match.lost_item_id)
    assert lost_item is not None, "lost_item_id is a NOT NULL FK — the referenced row always exists"
    if principal.role not in _AUTHORITY_ROLES and str(lost_item.reporter_user_id) != principal.user_id:
        raise AppError(code="FORBIDDEN", message="Only the person who lost the item can confirm or reject a match.", status_code=403)
    return match


@router.post("/matches/{match_id}/confirm", response_model=DataResponse[MatchOut])
async def confirm_match(
    match_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[MatchOut]:
    match = await _get_match_for_principal(session, match_id, principal)
    if match.status != MatchStatus.SUGGESTED:
        raise AppError(code="MATCH_ALREADY_DECIDED", message="This match has already been confirmed or rejected.", status_code=409)

    lost_item = await session.get(LostItemReport, match.lost_item_id)
    found_item = await session.get(FoundItemReport, match.found_item_id)
    assert lost_item is not None and found_item is not None, "FK targets always exist"

    match.status = MatchStatus.CONFIRMED
    lost_item.status = LostItemStatus.RESOLVED
    found_item.status = FoundItemStatus.CLAIMED

    await session.commit()
    return DataResponse(
        data=MatchOut(
            id=match.id, lost_item=_to_lost_item_out(lost_item), found_item=_to_found_item_out(found_item),
            similarity_score=float(match.similarity_score), status=match.status, created_at=match.created_at,
        )
    )


@router.post("/matches/{match_id}/reject", response_model=DataResponse[MatchOut])
async def reject_match(
    match_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[MatchOut]:
    match = await _get_match_for_principal(session, match_id, principal)
    if match.status != MatchStatus.SUGGESTED:
        raise AppError(code="MATCH_ALREADY_DECIDED", message="This match has already been confirmed or rejected.", status_code=409)

    match.status = MatchStatus.REJECTED
    lost_item = await session.get(LostItemReport, match.lost_item_id)
    found_item = await session.get(FoundItemReport, match.found_item_id)
    assert lost_item is not None and found_item is not None, "FK targets always exist"

    remaining = await session.execute(
        select(LostFoundMatch).where(
            LostFoundMatch.lost_item_id == lost_item.id, LostFoundMatch.status == MatchStatus.SUGGESTED, LostFoundMatch.id != match.id
        )
    )
    if remaining.scalar_one_or_none() is None and lost_item.status == LostItemStatus.MATCHED:
        lost_item.status = LostItemStatus.OPEN

    await session.commit()
    return DataResponse(
        data=MatchOut(
            id=match.id, lost_item=_to_lost_item_out(lost_item), found_item=_to_found_item_out(found_item),
            similarity_score=float(match.similarity_score), status=match.status, created_at=match.created_at,
        )
    )


@router.post("/found-items/{found_item_id}/mark-returned", response_model=DataResponse[FoundItemOut])
async def mark_found_item_returned(
    found_item_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[FoundItemOut]:
    """The physical handover step after a match is confirmed — a finder or
    an authority marks the item as actually handed back, distinct from
    `CLAIMED` (ownership identified, item not yet physically returned)."""
    found_item = await session.get(FoundItemReport, found_item_id)
    if found_item is None:
        raise AppError(code="FOUND_ITEM_NOT_FOUND", message="No such found item report.", status_code=404)
    if principal.role not in _AUTHORITY_ROLES and str(found_item.finder_user_id) != principal.user_id:
        raise AppError(code="FORBIDDEN", message="Only the finder (or an authority) can mark this returned.", status_code=403)
    if found_item.status != FoundItemStatus.CLAIMED:
        raise AppError(
            code="NOT_CLAIMED_YET", message="This item hasn't been matched and claimed by an owner yet.", status_code=409
        )
    found_item.status = FoundItemStatus.RETURNED
    await session.commit()
    return DataResponse(data=_to_found_item_out(found_item))
