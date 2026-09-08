import uuid

from pydantic import BaseModel, Field


class GuideAskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    destination_id: uuid.UUID | None = None


class GuideSourceOut(BaseModel):
    chunk_id: uuid.UUID
    document_title: str


class GuideAskOut(BaseModel):
    answer: str
    sources: list[GuideSourceOut]


class TranslateTextIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    target_language: str = Field(min_length=2, max_length=32)


class TranslateOut(BaseModel):
    translated_text: str


class TranslateImageIn(BaseModel):
    image_base64: str = Field(min_length=1)
    media_type: str
    target_language: str = Field(min_length=2, max_length=32)
