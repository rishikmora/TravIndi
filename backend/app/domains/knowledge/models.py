"""Knowledge domain models — `knowledge` schema. Added during Phase 5
reconciliation because neither version of the source Database Design document
gives its own detailed AI/RAG tables a schema home
(docs/00-planning/09-database-schema-plan.md §1).

Embedding dimension resolved at Phase 12: originally 1536 (an OpenAI
text-embedding-3-small-sized placeholder), changed to 384 when the actual
choice landed on a local `sentence-transformers` model
(all-MiniLM-L6-v2) instead of a paid embeddings API — see
app/core/config.py's `embedding_model_name` and the Phase 12
dimension-change Alembic revision that resized this column.
"""

import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin

EMBEDDING_DIM = 384


class MessageRole(enum.StrEnum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    TOOL = "TOOL"


class KnowledgeSource(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_sources"
    __table_args__ = {"schema": "knowledge"}

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    publisher: Mapped[str | None] = mapped_column(String(200))
    approval_status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")

    documents: Mapped[list["KnowledgeDocument"]] = relationship(back_populates="source")


class KnowledgeDocument(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = {"schema": "knowledge"}

    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge.knowledge_sources.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    language: Mapped[str | None] = mapped_column(String(8))
    topic: Mapped[str | None] = mapped_column(String(64))
    destination_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tourism.destinations.id"))

    source: Mapped["KnowledgeSource"] = relationship(back_populates="documents")
    versions: Mapped[list["KnowledgeVersion"]] = relationship(back_populates="document")
    chunks: Mapped[list["KnowledgeChunk"]] = relationship(back_populates="document")


class KnowledgeVersion(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_versions"
    __table_args__ = {"schema": "knowledge"}

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge.knowledge_documents.id", ondelete="CASCADE"), nullable=False
    )
    version_no: Mapped[int] = mapped_column(nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    document: Mapped["KnowledgeDocument"] = relationship(back_populates="versions")


class KnowledgeChunk(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index(
            "ix_knowledge_chunks_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        {"schema": "knowledge"},
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge.knowledge_documents.id", ondelete="CASCADE"), nullable=False
    )
    version_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("knowledge.knowledge_versions.id"))
    content: Mapped[str] = mapped_column(nullable=False)
    chunk_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)

    document: Mapped["KnowledgeDocument"] = relationship(back_populates="chunks")


class AiSession(UUIDPKMixin, Base):
    __tablename__ = "ai_sessions"
    __table_args__ = {"schema": "knowledge"}

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    messages: Mapped[list["AiMessage"]] = relationship(back_populates="session")


class AiMessage(UUIDPKMixin, Base):
    __tablename__ = "ai_messages"
    __table_args__ = {"schema": "knowledge"}

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge.ai_sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MessageRole] = mapped_column(Enum(MessageRole, name="ai_message_role", schema="knowledge"), nullable=False)
    content: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    session: Mapped["AiSession"] = relationship(back_populates="messages")
    tool_calls: Mapped[list["AiToolCall"]] = relationship(back_populates="message")


class AiToolCall(UUIDPKMixin, Base):
    """Explicit, authorized tool invocations — never unrestricted DB access
    (docs/00-planning/01-project-master-model.md §L)."""

    __tablename__ = "ai_tool_calls"
    __table_args__ = {"schema": "knowledge"}

    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge.ai_messages.id", ondelete="CASCADE"), nullable=False
    )
    tool_name: Mapped[str] = mapped_column(String(128), nullable=False)
    arguments: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    result: Mapped[dict | None] = mapped_column(JSONB)
    called_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    message: Mapped["AiMessage"] = relationship(back_populates="tool_calls")


class AiPrediction(UUIDPKMixin, Base):
    """General model-output metadata — distinct from `crowd.crowd_predictions`
    (docs/00-planning/09-database-schema-plan.md §2)."""

    __tablename__ = "ai_predictions"
    __table_args__ = {"schema": "knowledge"}

    prediction_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[uuid.UUID | None]
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    model_version: Mapped[str] = mapped_column(String(32), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
class Recommendation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "recommendations"
    __table_args__ = {"schema": "knowledge"}

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id"), nullable=False)
    recommendation_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[uuid.UUID | None]
    score: Mapped[float | None] = mapped_column(Numeric(6, 4))
    explanation: Mapped[str | None]
    model_version: Mapped[str] = mapped_column(String(32), nullable=False)
