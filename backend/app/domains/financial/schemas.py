import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.domains.financial.models import ExpenseCategory, ExpenseSource


class ExpenseCreateIn(BaseModel):
    trip_id: uuid.UUID | None = None
    category: ExpenseCategory
    amount: float = Field(gt=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    description: str | None = Field(default=None, max_length=500)
    incurred_at: datetime
    source: ExpenseSource = ExpenseSource.MANUAL


class ExpenseOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    trip_id: uuid.UUID | None
    category: ExpenseCategory
    amount: float
    currency: str
    description: str | None
    incurred_at: datetime
    source: ExpenseSource
    created_at: datetime


class ReceiptScanIn(BaseModel):
    image_base64: str
    media_type: str


class ReceiptScanOut(BaseModel):
    no_receipt_detected: bool
    amount: float
    currency: str
    vendor: str
    category_guess: ExpenseCategory
    date_text: str
    model_version: str


class TripFinancialSummaryOut(BaseModel):
    trip_id: uuid.UUID
    budget: float | None
    currency: str
    total_spent: float
    remaining: float | None
    is_over_budget: bool
    by_category: dict[str, float]
