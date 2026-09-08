"""Governance domain models — `governance` schema. Security and Privacy are
P0 at every deployment stage per the NFR priority matrix
(docs/00-planning/01-project-master-model.md §H); every critical-workflow
write elsewhere in the system emits an `AuditLog` row.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import UUIDPKMixin


class ActorType(enum.StrEnum):
    USER = "USER"
    SERVICE = "SERVICE"


class AuditLog(UUIDPKMixin, Base):
    """Append-only (immutable-ish, per the source documents' own hedge —
    docs/00-planning/01-project-master-model.md §M). No UPDATE/DELETE path is
    exposed anywhere in the application layer; enforced by omission, not a
    DB-level trigger, for MVP."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_correlation_id", "correlation_id"), {"schema": "governance"})

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("identity.users.id"))
    actor_type: Mapped[ActorType] = mapped_column(
        Enum(ActorType, name="audit_actor_type", schema="governance"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[uuid.UUID | None]
    correlation_id: Mapped[str | None] = mapped_column(String(64))
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)  # SUCCESS|DENIED|ERROR
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    audit_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class Policy(UUIDPKMixin, Base):
    """Registry of OPA policy documents in force — the Rego source itself
    lives in version control (Phase 9), this table tracks which version is
    active and provides an audit trail for policy changes."""

    __tablename__ = "policies"
    __table_args__ = {"schema": "governance"}

    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    description: Mapped[str | None]
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    active: Mapped[bool] = mapped_column(nullable=False, default=True)


class RetentionRule(UUIDPKMixin, Base):
    """Retention periods remain qualitative until frozen during pilot
    (NFR §10 — genuinely deferred, not resolved by this schema;
    docs/00-planning/06-architecture-audit-and-gaps.md). `retention_period_days`
    is nullable until a numeric value is confirmed."""

    __tablename__ = "retention_rules"
    __table_args__ = {"schema": "governance"}

    data_class: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    retention_period_days: Mapped[int | None]
    description: Mapped[str | None]
