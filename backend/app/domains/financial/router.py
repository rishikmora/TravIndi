"""Financial Intelligence — Feature Blueprint P2 domain #14. Real expense
tracking against a trip's real `budget` (`travel.trips.budget`, real since
Phase 12) plus real Claude-vision receipt OCR
(`app/domains/financial/receipt_scanner.py`). No payment gateway anywhere in
this codebase — this is bookkeeping only, exactly like `booking.total_amount`.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal
from app.core.errors import AppError
from app.db.session import get_db_session
from app.domains.financial.models import Expense, ExpenseCategory
from app.domains.financial.receipt_scanner import scan_receipt
from app.domains.financial.schemas import (
    ExpenseCreateIn,
    ExpenseOut,
    ReceiptScanIn,
    ReceiptScanOut,
    TripFinancialSummaryOut,
)
from app.domains.group_travel.access import is_trip_owner_or_active_member
from app.domains.travel.models import Trip
from app.schemas.common import DataResponse, ListResponse

router = APIRouter(prefix="/financial", tags=["financial"])


def _to_expense_out(row: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=row.id, user_id=row.user_id, trip_id=row.trip_id, category=row.category, amount=float(row.amount),
        currency=row.currency, description=row.description, incurred_at=row.incurred_at, source=row.source,
        created_at=row.created_at,
    )


async def _get_own_trip_or_none(session: AsyncSession, trip_id: uuid.UUID | None, principal: Principal) -> Trip | None:
    """Owner or any ACTIVE `group_travel` member may attach an expense to
    (or read expenses for) a trip — "group expenses" (Feature Blueprint P2)
    means each member logs their own spending against the shared trip, not
    just the owner."""
    if trip_id is None:
        return None
    trip = await session.get(Trip, trip_id)
    if trip is None:
        raise AppError(code="TRIP_NOT_FOUND", message="No such trip.", status_code=404)
    if not await is_trip_owner_or_active_member(session, trip, principal.user_id):
        raise AppError(code="FORBIDDEN", message="You aren't part of this trip.", status_code=403)
    return trip


@router.post("/expenses", response_model=DataResponse[ExpenseOut], status_code=201)
async def create_expense(
    body: ExpenseCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ExpenseOut]:
    await _get_own_trip_or_none(session, body.trip_id, principal)
    expense = Expense(
        user_id=uuid.UUID(principal.user_id), trip_id=body.trip_id, category=body.category, amount=body.amount,
        currency=body.currency, description=body.description, incurred_at=body.incurred_at, source=body.source,
    )
    session.add(expense)
    await session.commit()
    await session.refresh(expense)
    return DataResponse(data=_to_expense_out(expense))


@router.get("/expenses", response_model=ListResponse[ExpenseOut])
async def list_expenses(
    trip_id: uuid.UUID | None = None,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[ExpenseOut]:
    if trip_id is not None:
        await _get_own_trip_or_none(session, trip_id, principal)
        query = select(Expense).where(Expense.trip_id == trip_id)
    else:
        query = select(Expense).where(Expense.user_id == uuid.UUID(principal.user_id))
    rows = (await session.execute(query.order_by(Expense.incurred_at.desc()))).scalars().all()
    return ListResponse(data=[_to_expense_out(r) for r in rows])


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    expense = await session.get(Expense, expense_id)
    if expense is None:
        raise AppError(code="EXPENSE_NOT_FOUND", message="No such expense.", status_code=404)
    if str(expense.user_id) != principal.user_id:
        raise AppError(code="FORBIDDEN", message="You can only delete your own expenses.", status_code=403)
    await session.delete(expense)
    await session.commit()


@router.post("/receipts/scan", response_model=DataResponse[ReceiptScanOut])
async def scan_receipt_image(
    body: ReceiptScanIn, principal: Principal = Depends(get_current_principal)
) -> DataResponse[ReceiptScanOut]:
    """Real Claude-vision OCR — returns a draft only, never creates an
    `Expense`. The client shows this to the user to review/edit, then calls
    `POST /financial/expenses` with the (possibly corrected) fields."""
    result = await scan_receipt(image_base64=body.image_base64, media_type=body.media_type)
    return DataResponse(
        data=ReceiptScanOut(
            no_receipt_detected=result.no_receipt_detected, amount=result.amount, currency=result.currency,
            vendor=result.vendor, category_guess=ExpenseCategory(result.category_guess), date_text=result.date_text,
            model_version=result.model_version,
        )
    )


@router.get("/trips/{trip_id}/summary", response_model=DataResponse[TripFinancialSummaryOut])
async def get_trip_financial_summary(
    trip_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TripFinancialSummaryOut]:
    trip = await _get_own_trip_or_none(session, trip_id, principal)
    assert trip is not None  # trip_id is a required path param here, unlike the optional query param above

    rows = (await session.execute(select(Expense).where(Expense.trip_id == trip_id))).scalars().all()
    total_spent = sum(float(r.amount) for r in rows)
    by_category: dict[str, float] = {}
    for r in rows:
        by_category[r.category.value] = by_category.get(r.category.value, 0.0) + float(r.amount)

    budget = float(trip.budget) if trip.budget is not None else None
    remaining = (budget - total_spent) if budget is not None else None

    return DataResponse(
        data=TripFinancialSummaryOut(
            trip_id=trip_id, budget=budget, currency=trip.currency, total_spent=total_spent,
            remaining=remaining, is_over_budget=bool(remaining is not None and remaining < 0),
            by_category=by_category,
        )
    )
