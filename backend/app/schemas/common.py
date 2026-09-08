"""Canonical response envelopes — API Design §4.1/§4.2:

single object: {"data": {...}, "meta": {"request_id": ...}}
list:          {"data": [...], "meta": {"next_cursor", "has_more", "request_id"}}

Cursor pagination, default page size 20 / max 100 (API Design §4.1).
"""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


class ResponseMeta(BaseModel):
    request_id: str | None = None


class ListMeta(ResponseMeta):
    next_cursor: str | None = None
    has_more: bool = False


class DataResponse(BaseModel, Generic[T]):
    data: T
    meta: ResponseMeta = Field(default_factory=ResponseMeta)


class ListResponse(BaseModel, Generic[T]):
    data: list[T]
    meta: ListMeta = Field(default_factory=ListMeta)


class Pagination(BaseModel):
    cursor: str | None = None
    limit: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)
