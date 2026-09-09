"""AI Tourist Guide (FR-10) and Translation (FR-11) endpoints — both P1,
both stateless Claude-powered features with no dedicated resource of their
own (they read/write `knowledge.*` tables shared with the trip planner, not
a new schema). Mounted at `/ai/*` alongside app/domains/travel/router.py's
`ai_router` (same prefix, disjoint paths — both are "AI-powered feature"
routers, just owned by the domain whose tables they touch).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal
from app.db.session import get_db_session
from app.domains.knowledge import guide, heritage, translation
from app.domains.knowledge.schemas import (
    GuideAskIn,
    GuideAskOut,
    GuideSourceOut,
    HeritageStoryIn,
    HeritageStoryOut,
    TranslateImageIn,
    TranslateOut,
    TranslateTextIn,
)
from app.schemas.common import DataResponse

router = APIRouter(prefix="/ai", tags=["ai-guide-translation"])


@router.post("/guide/ask", response_model=DataResponse[GuideAskOut])
async def ask_tourist_guide(
    body: GuideAskIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[GuideAskOut]:
    result = await guide.ask_tourist_guide(
        session, user_id=principal.user_id, question=body.question, destination_id=body.destination_id
    )
    return DataResponse(
        data=GuideAskOut(
            answer=result.answer,
            sources=[GuideSourceOut(chunk_id=s.chunk_id, document_title=s.document_title) for s in result.sources],
        )
    )


@router.post("/heritage/story", response_model=DataResponse[HeritageStoryOut])
async def get_heritage_story(
    body: HeritageStoryIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[HeritageStoryOut]:
    result = await heritage.tell_heritage_story(session, user_id=principal.user_id, destination_id=body.destination_id)
    return DataResponse(
        data=HeritageStoryOut(
            story=result.story,
            grounded=result.grounded,
            sources=[GuideSourceOut(chunk_id=s.chunk_id, document_title=s.document_title) for s in result.sources],
        )
    )


@router.post("/translate", response_model=DataResponse[TranslateOut])
async def translate_text(
    body: TranslateTextIn,
    principal: Principal = Depends(get_current_principal),
) -> DataResponse[TranslateOut]:
    result = await translation.translate_text(text=body.text, target_language=body.target_language)
    return DataResponse(data=TranslateOut(translated_text=result.translated_text))


@router.post("/translate/image", response_model=DataResponse[TranslateOut])
async def translate_image(
    body: TranslateImageIn,
    principal: Principal = Depends(get_current_principal),
) -> DataResponse[TranslateOut]:
    result = await translation.translate_image(
        image_base64=body.image_base64, media_type=body.media_type, target_language=body.target_language
    )
    return DataResponse(data=TranslateOut(translated_text=result.translated_text))
