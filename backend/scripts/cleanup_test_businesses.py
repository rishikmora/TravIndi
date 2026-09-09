"""One-off cleanup: delete test-fixture businesses that accumulated in the
shared dev database from repeated integration-test runs (test_trust_and_
business.py's `_create_business` and this session's newer P2 test files all
create throwaway businesses like "Test Hotel a1b2c3" against the real dev
DB, never cleaned up). Keeps exactly the curated demo dataset from
app/db/seed_demo.py's `_BUSINESSES`.

Deletes in dependency order (tickets -> bookings -> availability ->
services -> business_profiles -> businesses) since Booking.service_id/
availability_id have no ON DELETE CASCADE. Run once: `python -m
scripts.cleanup_test_businesses`.
"""

import asyncio

from sqlalchemy import delete, select, text

from app.db.session import get_session_factory
from app.domains.booking.models import Booking, Ticket
from app.domains.business.models import Availability, Business, BusinessProfile, Service
from app.domains.trust.models import (
    FraudCase,
    Review,
    ReviewTargetType,
    Verification,
    VerificationSubjectType,
)

_KEEP_NAMES = {
    "Taj Heritage Inn",
    "Pink City Tours & Travels",
    "Ganga Aarti Rooftop Cafe",
    "Hampi Handicrafts Collective",
    "Golden City Cabs",
}


async def main() -> None:
    async with get_session_factory()() as session:
        await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))

        rows = (await session.execute(select(Business.id, Business.name))).all()
        to_delete = [business_id for business_id, name in rows if name not in _KEEP_NAMES]
        print(
            f"total businesses: {len(rows)} | keeping: {len(rows) - len(to_delete)} | deleting: {len(to_delete)}"
        )
        if not to_delete:
            print("Nothing to delete.")
        else:
            service_ids = (
                (
                    await session.execute(
                        select(Service.id).where(Service.business_id.in_(to_delete))
                    )
                )
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
                (
                    await session.execute(
                        select(Booking.id).where(Booking.service_id.in_(service_ids))
                    )
                )
                .scalars()
                .all()
            )
            print(
                f"cascading: {len(service_ids)} services, {len(availability_ids)} availability, {len(booking_ids)} bookings"
            )

            if booking_ids:
                await session.execute(delete(Ticket).where(Ticket.booking_id.in_(booking_ids)))
                await session.execute(delete(Booking).where(Booking.id.in_(booking_ids)))
            if availability_ids:
                await session.execute(
                    delete(Availability).where(Availability.id.in_(availability_ids))
                )
            if service_ids:
                await session.execute(delete(Service).where(Service.id.in_(service_ids)))
            await session.execute(
                delete(BusinessProfile).where(BusinessProfile.business_id.in_(to_delete))
            )
            await session.execute(delete(Business).where(Business.id.in_(to_delete)))
            await session.commit()
            print(f"Deleted {len(to_delete)} test businesses and everything cascading from them.")

        # Polymorphic rows (Verification/Review/FraudCase subject/target_id)
        # carry no real FK to businesses.id, so deleting a business above
        # left these dangling — clean up any that now point at nothing
        # (safe: Verification/Review/FraudCase are never referenced back by
        # anything except Credential, which cascades off Verification).
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
            print(
                f"Deleted {len(orphaned_verification_ids)} orphaned business verifications (+ their credentials)."
            )

        review_rows = (
            await session.execute(
                select(Review.id, Review.target_id).where(
                    Review.target_type == ReviewTargetType.BUSINESS
                )
            )
        ).all()
        orphaned_review_ids = [
            rid for rid, target_id in review_rows if target_id not in remaining_ids
        ]
        if orphaned_review_ids:
            await session.execute(delete(Review).where(Review.id.in_(orphaned_review_ids)))
            print(f"Deleted {len(orphaned_review_ids)} orphaned business reviews.")

        fraud_rows = (
            await session.execute(
                select(FraudCase.id, FraudCase.subject_id).where(
                    FraudCase.subject_type == "business"
                )
            )
        ).all()
        orphaned_fraud_ids = [
            fid
            for fid, subject_id in fraud_rows
            if subject_id is not None and subject_id not in remaining_ids
        ]
        if orphaned_fraud_ids:
            await session.execute(delete(FraudCase).where(FraudCase.id.in_(orphaned_fraud_ids)))
            print(f"Deleted {len(orphaned_fraud_ids)} orphaned business fraud cases.")

        await session.commit()


if __name__ == "__main__":
    asyncio.run(main())
