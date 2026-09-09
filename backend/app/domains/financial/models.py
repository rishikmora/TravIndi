"""Financial Intelligence domain models — `financial` schema (Feature
Blueprint P2 domain #14: trip budget tracking, expense categorization,
receipt OCR). Real expense tracking against `travel.trips.budget` (already
real since Phase 12) — never a fabricated spend total. No real payment
gateway integration exists anywhere in this codebase (see
`app/domains/booking/models.py`'s module docstring), so this is bookkeeping
only, same posture as booking's `total_amount`: users log what they spent,
this never moves real money.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPKMixin


class ExpenseCategory(enum.StrEnum):
    ACCOMMODATION = "ACCOMMODATION"
    FOOD = "FOOD"
    TRANSPORT = "TRANSPORT"
    SHOPPING = "SHOPPING"
    ACTIVITIES = "ACTIVITIES"
    OTHER = "OTHER"


class ExpenseSource(enum.StrEnum):
    MANUAL = "MANUAL"
    RECEIPT_SCAN = "RECEIPT_SCAN"


class Expense(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "expenses"
    __table_args__ = (Index("ix_expenses_trip_incurred", "trip_id", "incurred_at"), {"schema": "financial"})

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("travel.trips.id", ondelete="CASCADE"))
    category: Mapped[ExpenseCategory] = mapped_column(
        Enum(ExpenseCategory, name="expense_category", schema="financial"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    description: Mapped[str | None] = mapped_column(String(500))
    incurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[ExpenseSource] = mapped_column(
        Enum(ExpenseSource, name="expense_source", schema="financial"), nullable=False, default=ExpenseSource.MANUAL
    )
