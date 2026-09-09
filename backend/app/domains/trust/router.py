"""Verification, reviews, and fraud-case endpoints — wires up real routes
against infrastructure that existed since Phase 9 but was never connected:
the `authority_verifier` role (app/domains/identity/models.py `AuthorityRole`)
and the `verification` OPA resource type (infra/opa/policies/travindi/
authz.rego). `review` and `fraud_case` resource types were added to that
policy file in this same pass — docs/00-planning/08-role-permission-matrix.md
§3 explicitly defers "reviews, fraud cases, ticketing, etc." past the frozen
P0 matrix, so these follow the closest confirmed shape (the "Incident
report" row) rather than inventing an unrelated one.

AI enrichment (fake-review authenticity screening, fraud-signal triage,
app/domains/trust/moderation.py) is always best-effort: a missing
ANTHROPIC_API_KEY or a transient AI failure never blocks the underlying
review/fraud-report write, which is the real user-facing action ("AI
recommends, policy decides" — the write succeeds either way, humans decide
what to do with the signal).
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Principal, get_current_principal, get_pagination
from app.core.errors import AppError
from app.core.opa import require_allowed
from app.db.session import get_db_session
from app.domains.business.models import Business, Guide
from app.domains.gamification.engine import REVIEW_POINTS, advance_challenge_progress, award_points
from app.domains.gamification.models import GamificationCategory
from app.domains.governance.audit import write_audit_log
from app.domains.knowledge.models import AiPrediction
from app.domains.trust import moderation
from app.domains.trust.models import (
    Credential,
    FraudCase,
    FraudCaseStatus,
    FraudSignal,
    Review,
    ReviewAnalysis,
    ReviewTargetType,
    Verification,
    VerificationStatus,
    VerificationSubjectType,
)
from app.domains.trust.schemas import (
    FraudCaseCreateIn,
    FraudCaseOut,
    FraudCaseResolveIn,
    FraudSignalOut,
    ReviewAnalysisOut,
    ReviewCreateIn,
    ReviewOut,
    VerificationOut,
    VerificationRejectIn,
    VerificationSubmitIn,
)
from app.schemas.common import DataResponse, ListResponse, Pagination

router = APIRouter(prefix="/trust", tags=["trust"])

# Kept in sync by hand with the "fraud_case" read rule in
# infra/opa/policies/travindi/authz.rego — used only to scope the WHERE
# clause of list_fraud_cases (see that function's docstring for why this one
# spot uses a direct role check instead of `require_allowed`).
_FRAUD_CASE_AUTHORITY_READERS = {"authority_police", "authority_tourism_dept", "authority_platform_admin"}


def _to_verification_out(row: Verification) -> VerificationOut:
    return VerificationOut(
        id=row.id,
        subject_type=row.subject_type,
        subject_id=row.subject_id,
        submitted_by_user_id=row.submitted_by_user_id,
        status=row.status,
        reviewed_by_user_id=row.reviewed_by_user_id,
        reviewed_at=row.reviewed_at,
        rejection_reason=row.rejection_reason,
        created_at=row.created_at,
    )


def _can_see_review_analysis(principal: Principal, review: Review) -> bool:
    """Field-level visibility, not resource-level authorization (that's the
    `require_allowed` "review"/"read" check every caller already passed to
    reach this row) — the review itself is public to any authenticated
    principal, but the AI authenticity signal is only useful to the review's
    own author or a moderator-capable authority role."""
    return principal.user_id == str(review.author_user_id) or principal.role.startswith("authority_")


def _to_review_out(row: Review, principal: Principal) -> ReviewOut:
    analysis = None
    if row.analysis is not None and _can_see_review_analysis(principal, row):
        analysis = ReviewAnalysisOut(
            authenticity_score=row.analysis.authenticity_score,
            flags=list(row.analysis.flags.get("flags", [])),
            model_version=row.analysis.model_version,
        )
    return ReviewOut(
        id=row.id,
        author_user_id=row.author_user_id,
        target_type=row.target_type,
        target_id=row.target_id,
        rating=row.rating,
        body=row.body,
        status=row.status,
        created_at=row.created_at,
        analysis=analysis,
    )


def _to_fraud_case_out(row: FraudCase) -> FraudCaseOut:
    return FraudCaseOut(
        id=row.id,
        reported_by_user_id=row.reported_by_user_id,
        subject_type=row.subject_type,
        subject_id=row.subject_id,
        description=row.description,
        status=row.status,
        resolved_by_user_id=row.resolved_by_user_id,
        resolved_at=row.resolved_at,
        created_at=row.created_at,
        signals=[
            FraudSignalOut(signal_type=s.signal_type, confidence=s.confidence, details=s.details)
            for s in row.signals
        ],
    )


async def _resolve_subject_owner(
    session: AsyncSession, subject_type: VerificationSubjectType, subject_id: uuid.UUID
) -> uuid.UUID:
    """Looks up the real owner of the business/guide being submitted for
    verification — the domain-specific check OPA's generic `verification`
    resource type doesn't (and shouldn't) know how to do itself; mirrors
    `_get_incident_or_404` resolving `owner_id` from the DB row before
    calling `require_allowed` in app/domains/safety/router.py."""
    if subject_type == VerificationSubjectType.BUSINESS:
        business = await session.get(Business, subject_id)
        if business is None:
            raise AppError(code="SUBJECT_NOT_FOUND", message="No such business/guide.", status_code=404)
        return business.owner_user_id
    guide = await session.get(Guide, subject_id)
    if guide is None:
        raise AppError(code="SUBJECT_NOT_FOUND", message="No such business/guide.", status_code=404)
    return guide.user_id


async def _get_verification_or_404(session: AsyncSession, verification_id: uuid.UUID) -> Verification:
    verification = await session.get(Verification, verification_id)
    if verification is None:
        raise AppError(code="VERIFICATION_NOT_FOUND", message="No such verification.", status_code=404)
    return verification


async def _get_fraud_case_or_404(session: AsyncSession, case_id: uuid.UUID) -> FraudCase:
    case = await session.get(FraudCase, case_id, options=[selectinload(FraudCase.signals)])
    if case is None:
        raise AppError(code="FRAUD_CASE_NOT_FOUND", message="No such fraud case.", status_code=404)
    return case


# --- Verifications ---


@router.post("/verifications", response_model=DataResponse[VerificationOut], status_code=201)
async def submit_verification(
    body: VerificationSubmitIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[VerificationOut]:
    owner_id = await _resolve_subject_owner(session, body.subject_type, body.subject_id)
    await require_allowed(
        principal=principal, action="write", resource_type="verification", owner_id=str(owner_id)
    )
    verification = Verification(
        subject_type=body.subject_type,
        subject_id=body.subject_id,
        submitted_by_user_id=uuid.UUID(principal.user_id),
    )
    session.add(verification)
    await session.commit()
    await session.refresh(verification)
    return DataResponse(data=_to_verification_out(verification))


@router.get("/verifications", response_model=ListResponse[VerificationOut])
async def list_verifications(
    status: VerificationStatus | None = None,
    principal: Principal = Depends(get_current_principal),
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[VerificationOut]:
    await require_allowed(principal=principal, action="read", resource_type="verification")
    query = select(Verification).order_by(Verification.created_at.desc()).limit(pagination.limit)
    if status is not None:
        query = query.where(Verification.status == status)
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_verification_out(r) for r in rows])


@router.get("/verifications/{verification_id}", response_model=DataResponse[VerificationOut])
async def get_verification(
    verification_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[VerificationOut]:
    verification = await _get_verification_or_404(session, verification_id)
    await require_allowed(principal=principal, action="read", resource_type="verification")
    return DataResponse(data=_to_verification_out(verification))


@router.post("/verifications/{verification_id}/approve", response_model=DataResponse[VerificationOut])
async def approve_verification(
    verification_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[VerificationOut]:
    verification = await _get_verification_or_404(session, verification_id)
    await require_allowed(principal=principal, action="approve", resource_type="verification")
    if verification.status != VerificationStatus.PENDING:
        raise AppError(
            code="VERIFICATION_ALREADY_DECIDED", message="This verification has already been decided.", status_code=409
        )
    now = datetime.now(UTC)
    verification.status = VerificationStatus.APPROVED
    verification.reviewed_by_user_id = uuid.UUID(principal.user_id)
    verification.reviewed_at = now
    session.add(
        Credential(
            verification_id=verification.id,
            subject_type=verification.subject_type,
            subject_id=verification.subject_id,
            issued_at=now,
        )
    )
    subject: Business | Guide | None
    if verification.subject_type == VerificationSubjectType.BUSINESS:
        subject = await session.get(Business, verification.subject_id)
    else:
        subject = await session.get(Guide, verification.subject_id)
    if subject is not None:
        subject.is_verified = True
    await write_audit_log(
        session,
        actor_user_id=principal.user_id,
        action="VERIFICATION_APPROVED",
        resource_type="verification",
        resource_id=verification.id,
        metadata={"subject_type": verification.subject_type, "subject_id": str(verification.subject_id)},
    )
    await session.commit()
    await session.refresh(verification)
    return DataResponse(data=_to_verification_out(verification))


@router.post("/verifications/{verification_id}/reject", response_model=DataResponse[VerificationOut])
async def reject_verification(
    verification_id: uuid.UUID,
    body: VerificationRejectIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[VerificationOut]:
    verification = await _get_verification_or_404(session, verification_id)
    await require_allowed(principal=principal, action="reject", resource_type="verification")
    if verification.status != VerificationStatus.PENDING:
        raise AppError(
            code="VERIFICATION_ALREADY_DECIDED", message="This verification has already been decided.", status_code=409
        )
    verification.status = VerificationStatus.REJECTED
    verification.reviewed_by_user_id = uuid.UUID(principal.user_id)
    verification.reviewed_at = datetime.now(UTC)
    verification.rejection_reason = body.reason
    await write_audit_log(
        session,
        actor_user_id=principal.user_id,
        action="VERIFICATION_REJECTED",
        resource_type="verification",
        resource_id=verification.id,
        metadata={
            "subject_type": verification.subject_type,
            "subject_id": str(verification.subject_id),
            "reason": body.reason,
        },
    )
    await session.commit()
    await session.refresh(verification)
    return DataResponse(data=_to_verification_out(verification))


# --- Reviews ---


@router.post("/reviews", response_model=DataResponse[ReviewOut], status_code=201)
async def create_review(
    body: ReviewCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ReviewOut]:
    await require_allowed(principal=principal, action="write", resource_type="review", owner_id=principal.user_id)
    review = Review(
        author_user_id=uuid.UUID(principal.user_id),
        target_type=body.target_type,
        target_id=body.target_id,
        rating=body.rating,
        body=body.body,
    )
    session.add(review)
    await session.flush()

    try:
        outcome = await moderation.analyze_review(rating=body.rating, body=body.body)
        now = datetime.now(UTC)
        analysis = ReviewAnalysis(
            review_id=review.id,
            authenticity_score=outcome.authenticity_score,
            flags={"flags": outcome.flags, "reason": outcome.reason},
            model_version=outcome.model_version,
            analyzed_at=now,
        )
        session.add(analysis)
        session.add(
            AiPrediction(
                prediction_type="review_authenticity",
                target_type="review",
                target_id=review.id,
                value={"flags": outcome.flags, "reason": outcome.reason},
                confidence=outcome.authenticity_score,
                model_version=outcome.model_version,
                generated_at=now,
            )
        )
    except AppError:
        # Best-effort enrichment (see module docstring) — the review write
        # itself must not fail just because AI screening is unavailable.
        pass

    await award_points(
        session,
        user_id=review.author_user_id,
        points=REVIEW_POINTS,
        category=GamificationCategory.COMMUNITY,
        reason="Wrote a review",
        related_entity_type="review",
        related_entity_id=review.id,
    )
    review_count = (
        await session.execute(select(func.count(Review.id)).where(Review.author_user_id == review.author_user_id))
    ).scalar_one()  # includes this review — it was already flushed above
    await advance_challenge_progress(
        session, user_id=review.author_user_id, category=GamificationCategory.COMMUNITY, distinct_count=review_count
    )

    await session.commit()
    await session.refresh(review, attribute_names=["analysis"])
    return DataResponse(data=_to_review_out(review, principal))


@router.get("/reviews", response_model=ListResponse[ReviewOut])
async def list_reviews(
    target_type: ReviewTargetType,
    target_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[ReviewOut]:
    await require_allowed(principal=principal, action="read", resource_type="review")
    query = (
        select(Review)
        .options(selectinload(Review.analysis))
        .where(Review.target_type == target_type, Review.target_id == target_id, Review.status != "REMOVED")
        .order_by(Review.created_at.desc())
        .limit(pagination.limit)
    )
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_review_out(r, principal) for r in rows])


# --- Fraud cases ---


@router.post("/fraud-cases", response_model=DataResponse[FraudCaseOut], status_code=201)
async def report_fraud_case(
    body: FraudCaseCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[FraudCaseOut]:
    await require_allowed(
        principal=principal, action="write", resource_type="fraud_case", owner_id=principal.user_id
    )
    case = FraudCase(
        reported_by_user_id=uuid.UUID(principal.user_id),
        subject_type=body.subject_type,
        subject_id=body.subject_id,
        description=body.description,
    )
    session.add(case)
    await session.flush()

    try:
        classification = await moderation.classify_fraud_report(
            subject_type=body.subject_type, description=body.description
        )
        now = datetime.now(UTC)
        session.add(
            FraudSignal(
                case_id=case.id,
                signal_type=classification.signal_type,
                confidence=classification.confidence,
                details={"reasoning": classification.reasoning},
                detected_at=now,
            )
        )
        session.add(
            AiPrediction(
                prediction_type="fraud_signal",
                target_type="fraud_case",
                target_id=case.id,
                value={"signal_type": classification.signal_type, "reasoning": classification.reasoning},
                confidence=classification.confidence,
                model_version=classification.model_version,
                generated_at=now,
            )
        )
    except AppError:
        # Best-effort enrichment (see module docstring) — the report write
        # itself must not fail just because AI triage is unavailable.
        pass

    await session.commit()
    await session.refresh(case, attribute_names=["signals"])
    return DataResponse(data=_to_fraud_case_out(case))


@router.get("/fraud-cases", response_model=ListResponse[FraudCaseOut])
async def list_fraud_cases(
    principal: Principal = Depends(get_current_principal),
    pagination: Pagination = Depends(get_pagination),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[FraudCaseOut]:
    """Query-scoping only, not the authorization decision itself (that's
    `require_allowed` on the single-resource endpoints below) — `fraud_cases`
    isn't one of the 5 RLS-protected tables (app/api/deps.py), so unlike
    `list_incidents` there's no DB-level policy to lean on for list
    filtering. The role check here only decides the WHERE clause and mirrors
    exactly what the "fraud_case" read rule in
    infra/opa/policies/travindi/authz.rego already encodes for these roles."""
    query = (
        select(FraudCase).options(selectinload(FraudCase.signals)).order_by(FraudCase.created_at.desc()).limit(
            pagination.limit
        )
    )
    if principal.role not in _FRAUD_CASE_AUTHORITY_READERS:
        query = query.where(FraudCase.reported_by_user_id == uuid.UUID(principal.user_id))
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_fraud_case_out(r) for r in rows])


@router.get("/fraud-cases/{case_id}", response_model=DataResponse[FraudCaseOut])
async def get_fraud_case(
    case_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[FraudCaseOut]:
    case = await _get_fraud_case_or_404(session, case_id)
    owner_id = str(case.reported_by_user_id) if case.reported_by_user_id else None
    await require_allowed(principal=principal, action="read", resource_type="fraud_case", owner_id=owner_id)
    return DataResponse(data=_to_fraud_case_out(case))


@router.post("/fraud-cases/{case_id}/resolve", response_model=DataResponse[FraudCaseOut])
async def resolve_fraud_case(
    case_id: uuid.UUID,
    body: FraudCaseResolveIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[FraudCaseOut]:
    case = await _get_fraud_case_or_404(session, case_id)
    owner_id = str(case.reported_by_user_id) if case.reported_by_user_id else None
    await require_allowed(principal=principal, action="dispatch", resource_type="fraud_case", owner_id=owner_id)
    if case.status != FraudCaseStatus.OPEN:
        raise AppError(code="FRAUD_CASE_ALREADY_RESOLVED", message="This case is already resolved.", status_code=409)
    case.status = FraudCaseStatus(body.outcome)
    case.resolved_by_user_id = uuid.UUID(principal.user_id)
    case.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(case, attribute_names=["signals"])
    return DataResponse(data=_to_fraud_case_out(case))
