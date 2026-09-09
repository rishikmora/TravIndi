"""Social Tourism — Feature Blueprint P2 domain #16, scoped to the one
genuinely new piece: destination discussion threads (see
`app/domains/social/models.py`'s module docstring for why the rest of this
Blueprint domain isn't duplicated here). Public read, any authenticated
user may post — same posture as `trust.reviews`, minus the rating/AI
authenticity scoring, since this is deliberately lightweight free-form chat,
not a formal review.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_pagination
from app.core.errors import AppError
from app.db.session import get_db_session
from app.domains.social.models import DestinationDiscussionPost
from app.domains.social.schemas import DiscussionPostCreateIn, DiscussionPostOut
from app.domains.tourism.models import Destination
from app.schemas.common import DataResponse, ListResponse, Pagination

router = APIRouter(prefix="/social", tags=["social"])


def _to_post_out(row: DestinationDiscussionPost) -> DiscussionPostOut:
    return DiscussionPostOut(
        id=row.id, destination_id=row.destination_id, author_user_id=row.author_user_id, body=row.body,
        created_at=row.created_at,
    )


@router.post("/destinations/{destination_id}/discussions", response_model=DataResponse[DiscussionPostOut], status_code=201)
async def create_discussion_post(
    destination_id: uuid.UUID,
    body: DiscussionPostCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[DiscussionPostOut]:
    destination = await session.get(Destination, destination_id)
    if destination is None:
        raise AppError(code="DESTINATION_NOT_FOUND", message="No destination with that id.", status_code=404)
    post = DestinationDiscussionPost(
        destination_id=destination_id, author_user_id=uuid.UUID(principal.user_id), body=body.body,
        created_at=datetime.now(UTC),
    )
    session.add(post)
    await session.commit()
    await session.refresh(post)
    return DataResponse(data=_to_post_out(post))


@router.get("/destinations/{destination_id}/discussions", response_model=ListResponse[DiscussionPostOut])
async def list_discussion_posts(
    destination_id: uuid.UUID,
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[DiscussionPostOut]:
    rows = (
        await session.execute(
            select(DestinationDiscussionPost)
            .where(DestinationDiscussionPost.destination_id == destination_id)
            .order_by(DestinationDiscussionPost.created_at.desc())
            .limit(pagination.limit)
        )
    ).scalars().all()
    return ListResponse(data=[_to_post_out(r) for r in rows])
