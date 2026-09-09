import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DiscussionPostCreateIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class DiscussionPostOut(BaseModel):
    id: uuid.UUID
    destination_id: uuid.UUID
    author_user_id: uuid.UUID
    body: str
    created_at: datetime
