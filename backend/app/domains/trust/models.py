"""Trust domain models — `trust` schema (P1, confirmed table list per
docs/00-planning/09-database-schema-plan.md §1): verifications, credentials,
reviews, review_analysis, fraud_cases, fraud_signals, fraud_evidence.

Wires up real endpoints (Phase "P1 feature-gap pass") against infrastructure
that has existed since Phase 9 but was never connected: the
`authority_verifier` role (app/domains/identity/models.py `AuthorityRole`)
and the `verification` OPA resource type (infra/opa/policies/travindi/
authz.rego already encodes "verification write=owner, read/approve/reject=
authority_verifier" — see app/core/opa.py `require_allowed`).
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class VerificationSubjectType(enum.StrEnum):
    BUSINESS = "BUSINESS"
    GUIDE = "GUIDE"


class VerificationStatus(enum.StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class Verification(UUIDPKMixin, TimestampMixin, Base):
    """Polymorphic subject (`subject_type` + `subject_id`) rather than two
    nullable FKs — same reasoning as `travel.itinerary_items`' pattern, but
    simpler here since exactly one type is ever meant."""

    __tablename__ = "verifications"
    __table_args__ = (Index("ix_verifications_subject", "subject_type", "subject_id"), {"schema": "trust"})

    subject_type: Mapped[VerificationSubjectType] = mapped_column(
        Enum(VerificationSubjectType, name="verification_subject_type", schema="trust"), nullable=False
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status", schema="trust"),
        nullable=False,
        default=VerificationStatus.PENDING,
    )
    documents: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    """References to uploaded document metadata (object keys) — never raw
    PII blobs inline, matching `safety.incident_evidence`'s pattern. No
    document-upload endpoint exists yet in this pass; submitted as an empty
    object until Phase-equivalent S3 upload wiring lands."""
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None]

    credentials: Mapped[list["Credential"]] = relationship(back_populates="verification")


class Credential(UUIDPKMixin, TimestampMixin, Base):
    """Issued only by the verification-approval code path — never created
    directly, so a credential existing is a real signal an authority_verifier
    actually approved something."""

    __tablename__ = "credentials"
    __table_args__ = {"schema": "trust"}

    verification_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trust.verifications.id", ondelete="CASCADE"), nullable=False
    )
    subject_type: Mapped[VerificationSubjectType] = mapped_column(
        Enum(VerificationSubjectType, name="verification_subject_type", schema="trust"), nullable=False
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    credential_type: Mapped[str] = mapped_column(String(64), nullable=False, default="verified_badge")
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    verification: Mapped["Verification"] = relationship(back_populates="credentials")


class ReviewTargetType(enum.StrEnum):
    DESTINATION = "DESTINATION"
    ATTRACTION = "ATTRACTION"
    BUSINESS = "BUSINESS"
    GUIDE = "GUIDE"


class Review(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "reviews"
    __table_args__ = (Index("ix_reviews_target", "target_type", "target_id"), {"schema": "trust"})

    author_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    target_type: Mapped[ReviewTargetType] = mapped_column(
        Enum(ReviewTargetType, name="review_target_type", schema="trust"), nullable=False
    )
    target_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    rating: Mapped[int] = mapped_column(nullable=False)
    body: Mapped[str | None]
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PUBLISHED")  # PUBLISHED|FLAGGED|REMOVED

    analysis: Mapped["ReviewAnalysis | None"] = relationship(back_populates="review", uselist=False)


class ReviewAnalysis(UUIDPKMixin, Base):
    """Real AI-assisted fake-review screening (Claude classification — see
    app/domains/trust/moderation.py). Never auto-removes a review in this
    prototype (no moderation queue/actioning UI built) — flags for human
    attention only, consistent with "AI recommends, policy decides.\""""

    __tablename__ = "review_analysis"
    __table_args__ = {"schema": "trust"}

    review_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trust.reviews.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    authenticity_score: Mapped[float | None] = mapped_column(Numeric(4, 3))
    flags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    review: Mapped["Review"] = relationship(back_populates="analysis")


class FraudCaseStatus(enum.StrEnum):
    OPEN = "OPEN"
    CONFIRMED = "CONFIRMED"
    DISMISSED = "DISMISSED"


class FraudCase(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "fraud_cases"
    __table_args__ = {"schema": "trust"}

    reported_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    subject_type: Mapped[str] = mapped_column(String(32), nullable=False)  # business|guide|listing|message|other
    subject_id: Mapped[uuid.UUID | None]
    description: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[FraudCaseStatus] = mapped_column(
        Enum(FraudCaseStatus, name="fraud_case_status", schema="trust"), nullable=False, default=FraudCaseStatus.OPEN
    )
    resolved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    signals: Mapped[list["FraudSignal"]] = relationship(back_populates="case")
    evidence: Mapped[list["FraudEvidence"]] = relationship(back_populates="case")


class FraudSignal(UUIDPKMixin, Base):
    """Real AI-generated signal — a Claude classification of the reported
    text, not a placeholder (see app/domains/trust/moderation.py)."""

    __tablename__ = "fraud_signals"
    __table_args__ = {"schema": "trust"}

    case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trust.fraud_cases.id", ondelete="CASCADE"), nullable=False)
    signal_type: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    case: Mapped["FraudCase"] = relationship(back_populates="signals")


class FraudEvidence(UUIDPKMixin, Base):
    """Metadata only, matching `safety.incident_evidence`'s pattern — media
    lives in S3/MinIO, never inline. No upload endpoint yet (same honest gap
    as `Verification.documents`)."""

    __tablename__ = "fraud_evidence"
    __table_args__ = {"schema": "trust"}

    case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trust.fraud_cases.id", ondelete="CASCADE"), nullable=False)
    object_key: Mapped[str | None] = mapped_column(String(512))
    note: Mapped[str | None]
    added_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    case: Mapped["FraudCase"] = relationship(back_populates="evidence")
