"""Deletes test-fixture businesses (and everything that cascades from one)
that accumulate in the shared dev database from running the real
integration test suite against it — `tests/conftest.py`'s `client` fixture
talks to the same Postgres this demo's frontend points at, with no
transaction-per-test isolation (see that file's own docstring for why: real
outbound Keycloak/OPA calls plus tests that open a second, separate session
directly rule out simply wrapping each test in a rolled-back transaction).

`test_trust_and_business.py`'s `_create_business` and every newer P2 test
file that registers a business create rows like "Test Hotel a1b2c3" that
never get cleaned up on their own. This is called automatically by a
session-scoped autouse fixture in `tests/conftest.py` after the whole
`pytest` run finishes, and can also be run standalone via
`python -m scripts.cleanup_test_businesses` against a database that
accumulated pollution before this fixture existed.

Keeps exactly the curated demo dataset from `app/db/seed_demo.py`'s
`_BUSINESSES`. Deletes in dependency order (tickets -> bookings ->
availability -> services -> business_profiles -> businesses) since
`Booking.service_id`/`availability_id` have no `ON DELETE CASCADE`, then
cleans up polymorphic Verification/Review/FraudCase rows left dangling
(those carry no real FK to `businesses.id`).
"""

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.booking.models import Booking, Ticket
from app.domains.business.models import Availability, Business, BusinessProfile, Service
from app.domains.trust.models import (
    FraudCase,
    Review,
    ReviewTargetType,
    Verification,
    VerificationSubjectType,
)

KEEP_BUSINESS_NAMES = {
    "Taj Heritage Inn",
    "Pink City Tours & Travels",
    "Ganga Aarti Rooftop Cafe",
    "Hampi Handicrafts Collective",
    "Golden City Cabs",
}


async def cleanup_test_business_pollution(session: AsyncSession) -> dict[str, int]:
    """Runs the deletion described above against an already-open session
    (caller owns commit/rollback and connection lifecycle). Returns counts
    for logging/assertions — every key is present even when its count is 0."""
    await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))

    counts = {
        "businesses_deleted": 0,
        "services_deleted": 0,
        "availability_deleted": 0,
        "bookings_deleted": 0,
        "orphaned_verifications_deleted": 0,
        "orphaned_reviews_deleted": 0,
        "orphaned_fraud_cases_deleted": 0,
    }

    rows = (await session.execute(select(Business.id, Business.name))).all()
    to_delete = [business_id for business_id, name in rows if name not in KEEP_BUSINESS_NAMES]

    if to_delete:
        service_ids = (
            (await session.execute(select(Service.id).where(Service.business_id.in_(to_delete))))
            .scalars()
            .all()
        )
        availability_ids = (
            (
                await session.execute(
                    select(Availability.id).where(Availability.service_id.in_(service_ids))
                )
            )
            .scalars()
            .all()
        )
        booking_ids = (
            (await session.execute(select(Booking.id).where(Booking.service_id.in_(service_ids))))
            .scalars()
            .all()
        )

        if booking_ids:
            await session.execute(delete(Ticket).where(Ticket.booking_id.in_(booking_ids)))
            await session.execute(delete(Booking).where(Booking.id.in_(booking_ids)))
        if availability_ids:
            await session.execute(delete(Availability).where(Availability.id.in_(availability_ids)))
        if service_ids:
            await session.execute(delete(Service).where(Service.id.in_(service_ids)))
        await session.execute(
            delete(BusinessProfile).where(BusinessProfile.business_id.in_(to_delete))
        )
        await session.execute(delete(Business).where(Business.id.in_(to_delete)))
        await session.commit()

        counts["businesses_deleted"] = len(to_delete)
        counts["services_deleted"] = len(service_ids)
        counts["availability_deleted"] = len(availability_ids)
        counts["bookings_deleted"] = len(booking_ids)

    # Polymorphic rows (Verification/Review/FraudCase subject/target_id)
    # carry no real FK to businesses.id, so deleting a business above left
    # these dangling — clean up any that now point at nothing (safe:
    # Verification/Review/FraudCase are never referenced back by anything
    # except Credential, which cascades off Verification).
    remaining_ids = set((await session.execute(select(Business.id))).scalars().all())

    verification_rows = (
        await session.execute(
            select(Verification.id, Verification.subject_id).where(
                Verification.subject_type == VerificationSubjectType.BUSINESS
            )
        )
    ).all()
    orphaned_verification_ids = [
        vid for vid, subject_id in verification_rows if subject_id not in remaining_ids
    ]
    if orphaned_verification_ids:
        await session.execute(
            delete(Verification).where(Verification.id.in_(orphaned_verification_ids))
        )
        counts["orphaned_verifications_deleted"] = len(orphaned_verification_ids)

    review_rows = (
        await session.execute(
            select(Review.id, Review.target_id).where(
                Review.target_type == ReviewTargetType.BUSINESS
            )
        )
    ).all()
    orphaned_review_ids = [rid for rid, target_id in review_rows if target_id not in remaining_ids]
    if orphaned_review_ids:
        await session.execute(delete(Review).where(Review.id.in_(orphaned_review_ids)))
        counts["orphaned_reviews_deleted"] = len(orphaned_review_ids)

    fraud_rows = (
        await session.execute(
            select(FraudCase.id, FraudCase.subject_id).where(FraudCase.subject_type == "business")
        )
    ).all()
    orphaned_fraud_ids = [
        fid
        for fid, subject_id in fraud_rows
        if subject_id is not None and subject_id not in remaining_ids
    ]
    if orphaned_fraud_ids:
        await session.execute(delete(FraudCase).where(FraudCase.id.in_(orphaned_fraud_ids)))
        counts["orphaned_fraud_cases_deleted"] = len(orphaned_fraud_ids)

    await session.commit()
    return counts
