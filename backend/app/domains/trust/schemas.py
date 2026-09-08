import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.trust.models import (
    FraudCaseStatus,
    ReviewTargetType,
    VerificationStatus,
    VerificationSubjectType,
)

FraudSubjectType = Literal["business", "guide", "listing", "message", "other"]


class VerificationSubmitIn(BaseModel):
    subject_type: VerificationSubjectType
    subject_id: uuid.UUID


class VerificationOut(BaseModel):
    id: uuid.UUID
    subject_type: VerificationSubjectType
    subject_id: uuid.UUID
    submitted_by_user_id: uuid.UUID
    status: VerificationStatus
    reviewed_by_user_id: uuid.UUID | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    created_at: datetime


class VerificationRejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class ReviewCreateIn(BaseModel):
    target_type: ReviewTargetType
    target_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    body: str | None = Field(default=None, max_length=4000)


class ReviewAnalysisOut(BaseModel):
    authenticity_score: float | None
    flags: list[str]
    model_version: str


class ReviewOut(BaseModel):
    id: uuid.UUID
    author_user_id: uuid.UUID
    target_type: ReviewTargetType
    target_id: uuid.UUID
    rating: int
    body: str | None
    status: str
    created_at: datetime
    analysis: ReviewAnalysisOut | None = None


class FraudCaseCreateIn(BaseModel):
    subject_type: FraudSubjectType
    subject_id: uuid.UUID | None = None
    description: str = Field(min_length=1, max_length=4000)


class FraudCaseResolveIn(BaseModel):
    outcome: Literal["CONFIRMED", "DISMISSED"]


class FraudSignalOut(BaseModel):
    signal_type: str
    confidence: float | None
    details: dict


class FraudCaseOut(BaseModel):
    id: uuid.UUID
    reported_by_user_id: uuid.UUID | None
    subject_type: str
    subject_id: uuid.UUID | None
    description: str
    status: FraudCaseStatus
    resolved_by_user_id: uuid.UUID | None
    resolved_at: datetime | None
    created_at: datetime
    signals: list[FraudSignalOut] = Field(default_factory=list)
