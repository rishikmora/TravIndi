"""Real embedding-based match search — no fabricated scores. A "match" is
never auto-confirmed here: this only creates `SUGGESTED` rows for a human
(the reporter, or an authority helping them) to confirm or reject via
`app/domains/lost_found/router.py`.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai.rag import embed_text
from app.domains.lost_found.models import (
    FoundItemReport,
    FoundItemStatus,
    LostFoundMatch,
    LostItemReport,
    LostItemStatus,
)

_MAX_CANDIDATES = 5
_MAX_COSINE_DISTANCE = 0.6  # similarity = 1 - distance; below this is too dissimilar to surface


async def embed_report_text(title: str, description: str) -> list[float]:
    return await embed_text(f"{title}. {description}")


async def find_and_store_matches_for_lost_item(session: AsyncSession, lost_item: LostItemReport) -> list[LostFoundMatch]:
    candidates = (
        await session.execute(
            select(FoundItemReport, FoundItemReport.embedding.cosine_distance(lost_item.embedding).label("distance"))
            .where(FoundItemReport.category == lost_item.category, FoundItemReport.status == FoundItemStatus.OPEN)
            .order_by(FoundItemReport.embedding.cosine_distance(lost_item.embedding))
            .limit(_MAX_CANDIDATES)
        )
    ).all()
    return await _store_matches(session, lost_item=lost_item, candidates=[(f, d) for f, d in candidates if d <= _MAX_COSINE_DISTANCE])


async def find_and_store_matches_for_found_item(session: AsyncSession, found_item: FoundItemReport) -> list[LostFoundMatch]:
    candidates = (
        await session.execute(
            select(LostItemReport, LostItemReport.embedding.cosine_distance(found_item.embedding).label("distance"))
            .where(LostItemReport.category == found_item.category, LostItemReport.status == LostItemStatus.OPEN)
            .order_by(LostItemReport.embedding.cosine_distance(found_item.embedding))
            .limit(_MAX_CANDIDATES)
        )
    ).all()
    matches = []
    for lost_item, distance in candidates:
        if distance > _MAX_COSINE_DISTANCE:
            continue
        matches.extend(await _store_matches(session, lost_item=lost_item, candidates=[(found_item, distance)]))
    return matches


async def _store_matches(
    session: AsyncSession, *, lost_item: LostItemReport, candidates: list[tuple[FoundItemReport, float]]
) -> list[LostFoundMatch]:
    created = []
    for found_item, distance in candidates:
        existing = await session.execute(
            select(LostFoundMatch).where(
                LostFoundMatch.lost_item_id == lost_item.id, LostFoundMatch.found_item_id == found_item.id
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue
        match = LostFoundMatch(
            lost_item_id=lost_item.id,
            found_item_id=found_item.id,
            similarity_score=max(0.0, 1.0 - float(distance)),
            created_at=datetime.now(UTC),
        )
        session.add(match)
        created.append(match)
    if created and lost_item.status == LostItemStatus.OPEN:
        lost_item.status = LostItemStatus.MATCHED
    await session.flush()
    return created
