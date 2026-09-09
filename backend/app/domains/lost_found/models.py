"""Lost & Found domain models — `lost_found` schema (Feature Blueprint P2
domain #26: lost-item reporting, found-item reporting, image/location-based
matching, authority-assisted recovery).

Matching is real, not fabricated: `title + description` is embedded with the
same local `sentence-transformers` model the RAG knowledge base uses
(`app/core/ai/rag.py`'s `embed_text`), and candidate matches are found via a
genuine pgvector cosine-similarity search against reports of the opposite
kind — never a hand-picked "looks similar" placeholder. A suggested match
never auto-resolves a case; a human (the reporter or an authority) still
confirms it, same "AI recommends, policy decides" posture as review/fraud
moderation elsewhere in this codebase — the difference is this "AI" step is
a deterministic vector similarity computation, not an LLM call, so there's
no hallucination risk to guard against, only a relevance threshold.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin
from app.domains.knowledge.models import EMBEDDING_DIM


class LostFoundCategory(enum.StrEnum):
    ELECTRONICS = "ELECTRONICS"
    DOCUMENTS = "DOCUMENTS"
    BAG_LUGGAGE = "BAG_LUGGAGE"
    CLOTHING = "CLOTHING"
    JEWELRY = "JEWELRY"
    OTHER = "OTHER"


class LostItemStatus(enum.StrEnum):
    OPEN = "OPEN"
    MATCHED = "MATCHED"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class FoundItemStatus(enum.StrEnum):
    OPEN = "OPEN"
    CLAIMED = "CLAIMED"
    RETURNED = "RETURNED"


class LostItemReport(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "lost_item_reports"
    __table_args__ = (
        Index(
            "ix_lost_item_reports_embedding", "embedding",
            postgresql_using="hnsw", postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        {"schema": "lost_found"},
    )

    reporter_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[LostFoundCategory] = mapped_column(
        Enum(LostFoundCategory, name="lost_found_category", schema="lost_found"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    lost_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    location: Mapped[str | None] = mapped_column(Geography(geometry_type="POINT", srid=4326))
    status: Mapped[LostItemStatus] = mapped_column(
        Enum(LostItemStatus, name="lost_item_status", schema="lost_found"), nullable=False, default=LostItemStatus.OPEN
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)

    matches: Mapped[list["LostFoundMatch"]] = relationship(back_populates="lost_item", foreign_keys="LostFoundMatch.lost_item_id")


class FoundItemReport(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "found_item_reports"
    __table_args__ = (
        Index(
            "ix_found_item_reports_embedding", "embedding",
            postgresql_using="hnsw", postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        {"schema": "lost_found"},
    )

    finder_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[LostFoundCategory] = mapped_column(
        Enum(LostFoundCategory, name="lost_found_category", schema="lost_found"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(nullable=False)
    found_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))
    location: Mapped[str | None] = mapped_column(Geography(geometry_type="POINT", srid=4326))
    storage_location: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[FoundItemStatus] = mapped_column(
        Enum(FoundItemStatus, name="found_item_status", schema="lost_found"), nullable=False, default=FoundItemStatus.OPEN
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)

    matches: Mapped[list["LostFoundMatch"]] = relationship(back_populates="found_item", foreign_keys="LostFoundMatch.found_item_id")


class MatchStatus(enum.StrEnum):
    SUGGESTED = "SUGGESTED"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"


class LostFoundMatch(UUIDPKMixin, Base):
    __tablename__ = "lost_found_matches"
    __table_args__ = (
        Index("ix_lost_found_matches_pair", "lost_item_id", "found_item_id", unique=True),
        {"schema": "lost_found"},
    )

    lost_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lost_found.lost_item_reports.id", ondelete="CASCADE"), nullable=False)
    found_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lost_found.found_item_reports.id", ondelete="CASCADE"), nullable=False)
    similarity_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, name="lost_found_match_status", schema="lost_found"), nullable=False, default=MatchStatus.SUGGESTED
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    lost_item: Mapped["LostItemReport"] = relationship(back_populates="matches", foreign_keys=[lost_item_id])
    found_item: Mapped["FoundItemReport"] = relationship(back_populates="matches", foreign_keys=[found_item_id])
