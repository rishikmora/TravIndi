"""Richer demo data — businesses, guides, verifications, reviews, fraud
reports, and bookings — layered on top of `app/db/seed.py`'s destinations.
Kept as its own script (same split rationale as `seed_knowledge.py`): this
one needs the Keycloak Admin API for real account provisioning and the real
Claude-backed review/fraud moderation functions, neither of which `seed.py`'s
pure-DB-write destinations/attractions need.

Every account created here is provisioned the same way a real signup would
be — through the Keycloak Admin API (`app/core/keycloak_admin.py`, the same
client `/auth/register` uses) plus the matching `identity.users`/
`user_profiles` rows — not a fabricated identity table. Reviews and fraud
reports call the real `app/domains/trust/moderation.py` functions (genuine
Claude API calls, same code path the live endpoints use), kept to a modest
volume (8 reviews, 3 fraud reports) to bound real API cost, rather than
fabricating authenticity scores. Verifications go through the exact
approve/reject state changes `app/domains/trust/router.py` performs (issuing
a real `Credential` row and flipping `is_verified`), including a genuine
PENDING and a genuine REJECTED case so the trust dashboard isn't all-green.

Split into one function per resource type (accounts/businesses/guides/
reviews/fraud reports/bookings) rather than one long function — every loop
gets its own scope, so mypy can track each local variable's type precisely
instead of unifying same-named locals (`service`, `destination`, ...) across
unrelated loops in one giant function body.

Usage: `python -m app.db.seed_demo` (needs DATABASE_URL, the Keycloak admin
service account, and ANTHROPIC_API_KEY configured — same env as the running
API). Run `python -m app.db.seed` first so destinations exist to attach to.
Safe to re-run: every account/business/review/case/booking is checked before
insert.
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.keycloak_admin import create_user, get_user_id_by_email
from app.db.session import get_engine, get_session_factory
from app.domains.booking.models import Booking, BookingStatus, Ticket
from app.domains.business.models import (
    Availability,
    Business,
    BusinessCategory,
    BusinessProfile,
    Guide,
    Service,
)
from app.domains.identity.models import User, UserProfile
from app.domains.knowledge.models import AiPrediction
from app.domains.tourism.models import Destination
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
from app.domains.trust.moderation import analyze_review, classify_fraud_report

_DEMO_PASSWORD = "Test1234!"

# (email, local account_type, Keycloak realm role). The verifier is
# provisioned directly with the authority_verifier realm role — authority
# accounts are never self-registerable (app/domains/identity/schemas.py
# `SelfRegisterableAccountType`), so a script doing admin-level provisioning
# is the realistic stand-in for "an admin set this account up out-of-band."
_DEMO_ACCOUNTS: list[tuple[str, str, str]] = [
    ("rajesh.hotels@travindi-demo.in", "business", "business"),
    ("priya.tours@travindi-demo.in", "business", "business"),
    ("arjun.eats@travindi-demo.in", "business", "business"),
    ("fatima.crafts@travindi-demo.in", "business", "business"),
    ("suresh.cabs@travindi-demo.in", "business", "business"),
    ("ananya.guide@travindi-demo.in", "guide", "guide"),
    ("vikram.guide@travindi-demo.in", "guide", "guide"),
    ("lakshmi.guide@travindi-demo.in", "guide", "guide"),
    ("tourist.demo1@travindi-demo.in", "tourist", "tourist"),
    ("tourist.demo2@travindi-demo.in", "tourist", "tourist"),
    ("tourist.demo3@travindi-demo.in", "tourist", "tourist"),
    ("verifier.demo@travindi-demo.in", "authority", "authority_verifier"),
    ("admin.demo@travindi-demo.in", "authority", "authority_platform_admin"),
]

# Demo businesses are fictional (no real establishment exists to
# photograph), so unlike `app/db/seed.py`'s real destination photos this is
# deliberately NOT "a real photo of this specific business" — one real,
# generic, category-representative Wikimedia Commons photo per
# `BusinessCategory`, self-hosted under `web/public/images/businesses/`
# with a category-named (not business-named) filename so the naming itself
# signals "illustrative category image". Same "fabricated seed data, never
# reported as real telemetry" honesty posture as the rest of this module.
_CATEGORY_IMAGES: dict[BusinessCategory, str] = {
    BusinessCategory.HOTEL: "/images/businesses/hotel.jpg",
    BusinessCategory.TOUR_OPERATOR: "/images/businesses/tour-operator.jpg",
    BusinessCategory.RESTAURANT: "/images/businesses/restaurant.jpg",
    BusinessCategory.ARTISAN: "/images/businesses/artisan.jpg",
    BusinessCategory.TAXI: "/images/businesses/taxi.jpg",
}

_BUSINESSES: list[dict[str, Any]] = [
    {
        "owner_email": "rajesh.hotels@travindi-demo.in",
        "name": "Taj Heritage Inn",
        "category": BusinessCategory.HOTEL,
        "destination": "Taj Mahal",
        "lon": 78.0421,
        "lat": 27.1751,
        "description": "A family-run heritage-style hotel a short walk from the Taj Mahal's east gate, popular with early sunrise visitors.",
        "verification": VerificationStatus.APPROVED,
        "service_name": "Deluxe Room (per night)",
        "base_price": 4500.0,
        "slot_capacity": 5,
    },
    {
        "owner_email": "priya.tours@travindi-demo.in",
        "name": "Pink City Tours & Travels",
        "category": BusinessCategory.TOUR_OPERATOR,
        "destination": "Amber Fort",
        "lon": 75.8513,
        "lat": 26.9855,
        "description": "Full-day guided tours of Amber Fort and Jaipur's old city, with an air-conditioned vehicle and English/Hindi-speaking driver-guide.",
        "verification": VerificationStatus.APPROVED,
        "service_name": "Full-Day Amber Fort & Jaipur City Tour",
        "base_price": 2200.0,
        "slot_capacity": 12,
    },
    {
        "owner_email": "arjun.eats@travindi-demo.in",
        "name": "Ganga Aarti Rooftop Cafe",
        "category": BusinessCategory.RESTAURANT,
        "destination": "Dashashwamedh Ghat",
        "lon": 83.0107,
        "lat": 25.3109,
        "description": "Rooftop restaurant overlooking Dashashwamedh Ghat with a view of the evening Ganga Aarti ceremony.",
        "verification": VerificationStatus.PENDING,
        "service_name": "Riverside Thali Dinner",
        "base_price": 450.0,
        "slot_capacity": 20,
    },
    {
        "owner_email": "fatima.crafts@travindi-demo.in",
        "name": "Hampi Handicrafts Collective",
        "category": BusinessCategory.ARTISAN,
        "destination": "Hampi",
        "lon": 76.4600,
        "lat": 15.3350,
        "description": "Artisan cooperative near Virupaksha Temple running short stone-carving and handicraft workshops for visitors.",
        "verification": VerificationStatus.APPROVED,
        "service_name": "Stone Carving Workshop (2hr)",
        "base_price": 800.0,
        "slot_capacity": 8,
    },
    {
        "owner_email": "suresh.cabs@travindi-demo.in",
        "name": "Golden City Cabs",
        "category": BusinessCategory.TAXI,
        "destination": "Golden Temple",
        "lon": 74.8765,
        "lat": 31.6200,
        "description": "Airport and intercity taxi service based near the Golden Temple.",
        "verification": VerificationStatus.REJECTED,
        "rejection_reason": "Submitted documents did not match business registration records.",
        "service_name": "Airport Transfer (Sedan)",
        "base_price": 600.0,
        "slot_capacity": 3,
    },
]

_GUIDES: list[dict[str, Any]] = [
    {
        "user_email": "ananya.guide@travindi-demo.in",
        "destination": "Khajuraho Group of Monuments",
        "languages": ["en", "hi"],
        "specialties": ["heritage", "architecture"],
        "bio": "Licensed heritage guide specializing in the temple sculpture and history of Khajuraho.",
        "verification": VerificationStatus.APPROVED,
    },
    {
        "user_email": "vikram.guide@travindi-demo.in",
        "destination": "Hampi",
        "languages": ["en", "hi", "kn"],
        "specialties": ["history", "trekking"],
        "bio": "Local guide covering Hampi's ruins and boulder-hill trekking routes.",
        "verification": VerificationStatus.APPROVED,
    },
    {
        "user_email": "lakshmi.guide@travindi-demo.in",
        "destination": "Meenakshi Amman Temple",
        "languages": ["en", "ta"],
        "specialties": ["temple architecture"],
        "bio": "Madurai-based guide for Meenakshi Amman Temple and the old city.",
        "verification": VerificationStatus.PENDING,
    },
]

# (author_email, target_type, target_name, rating, body). `target_name` is
# resolved against businesses/guides/destinations created above. One review
# (the Ganga Aarti one) is deliberately generic/superlative-heavy to give
# the real AI authenticity screening something genuinely low-scoring to
# flag, rather than every seeded review scoring the same.
_REVIEWS: list[tuple[str, ReviewTargetType, str, int, str]] = [
    ("tourist.demo1@travindi-demo.in", ReviewTargetType.BUSINESS, "Taj Heritage Inn", 5,
     "Stayed here for two nights before our sunrise Taj Mahal visit. Room was clean, staff arranged an early taxi to the east gate without any fuss, and the rooftop has a partial view of the minarets."),
    ("tourist.demo2@travindi-demo.in", ReviewTargetType.BUSINESS, "Taj Heritage Inn", 2,
     "Room was fine but the water heater didn't work on our second morning and it took over an hour for anyone to come look at it. Location is the main reason to stay here."),
    ("tourist.demo3@travindi-demo.in", ReviewTargetType.BUSINESS, "Pink City Tours & Travels", 5,
     "Our driver-guide knew a huge amount about Amber Fort's history and paced the day well so we weren't rushed. Would book again for another city."),
    ("tourist.demo1@travindi-demo.in", ReviewTargetType.BUSINESS, "Hampi Handicrafts Collective", 4,
     "Fun two-hour stone carving session, good for a half-day break from temple-hopping. A bit hard to find the workshop entrance from the main road."),
    ("tourist.demo2@travindi-demo.in", ReviewTargetType.BUSINESS, "Golden City Cabs", 1,
     "Quoted 600 rupees for the airport transfer over the phone but the driver demanded 1500 at drop-off and had no receipt to give us."),
    ("tourist.demo3@travindi-demo.in", ReviewTargetType.GUIDE, "ananya.guide@travindi-demo.in", 5,
     "Ananya's explanation of the temple carvings at Khajuraho was detailed without being a rehearsed script — she adjusted the tour based on what we were curious about."),
    ("tourist.demo1@travindi-demo.in", ReviewTargetType.DESTINATION, "Taj Mahal", 5,
     "Went for sunrise entry and it was worth the early alarm — far fewer crowds than midday and the light on the marble was incredible."),
    ("tourist.demo2@travindi-demo.in", ReviewTargetType.BUSINESS, "Ganga Aarti Rooftop Cafe", 5,
     "Best place ever!!! Amazing amazing amazing food and view!!! Highly highly recommend to everyone, you will not regret it!!!"),
]

_FRAUD_REPORTS: list[tuple[str, str, str | None, str]] = [
    ("tourist.demo2@travindi-demo.in", "business", "Golden City Cabs",
     "The taxi driver quoted 600 rupees for an airport transfer over the phone but charged 1500 rupees at drop-off and refused to give a receipt when asked."),
    ("tourist.demo1@travindi-demo.in", "listing", None,
     "I received a WhatsApp message claiming to be from 'TravIndi Support' asking me to pay a refundable security deposit via UPI to confirm my hotel booking. This looks like a phishing attempt, not a real request from the platform."),
    ("tourist.demo3@travindi-demo.in", "guide", None,
     "A man outside Meenakshi Amman Temple introduced himself as a certified guide and charged us three times the normal rate for a 10-minute walk before leaving abruptly."),
]

# (tourist_email, business_name, party_size)
_BOOKINGS: list[tuple[str, str, int]] = [
    ("tourist.demo1@travindi-demo.in", "Taj Heritage Inn", 2),
    ("tourist.demo1@travindi-demo.in", "Pink City Tours & Travels", 3),
    ("tourist.demo2@travindi-demo.in", "Hampi Handicrafts Collective", 1),
]


async def _get_or_create_demo_user(
    session: AsyncSession, *, email: str, account_type: str, realm_role: str
) -> User:
    existing = await session.execute(select(User).where(User.email == email))
    user = existing.scalar_one_or_none()
    if user is not None:
        return user

    keycloak_user_id = await get_user_id_by_email(email)
    if keycloak_user_id is None:
        try:
            keycloak_user_id = await create_user(
                email=email, phone=None, password=_DEMO_PASSWORD, realm_role=realm_role
            )
        except AppError as exc:
            if exc.code != "USER_ALREADY_EXISTS":
                raise
            keycloak_user_id = await get_user_id_by_email(email)
            if keycloak_user_id is None:
                raise

    user = User(id=uuid.UUID(keycloak_user_id), email=email, account_type=account_type)
    session.add(user)
    session.add(UserProfile(user_id=user.id))
    await session.flush()
    return user


async def _seed_accounts(session: AsyncSession) -> dict[str, User]:
    users_by_email: dict[str, User] = {}
    for email, account_type, realm_role in _DEMO_ACCOUNTS:
        users_by_email[email] = await _get_or_create_demo_user(
            session, email=email, account_type=account_type, realm_role=realm_role
        )
    await session.commit()
    return users_by_email


async def _load_destinations(session: AsyncSession, names: set[str]) -> dict[str, Destination]:
    destinations_by_name: dict[str, Destination] = {}
    for name in names:
        result = await session.execute(select(Destination).where(Destination.name == name))
        destination = result.scalar_one_or_none()
        if destination is None:
            print(f"Skipping entries for {name!r} — run `python -m app.db.seed` first.")
            continue
        destinations_by_name[name] = destination
    return destinations_by_name


async def _seed_businesses(
    session: AsyncSession, users_by_email: dict[str, User], destinations_by_name: dict[str, Destination], verifier: User
) -> tuple[dict[str, Business], dict[str, Service], dict[str, list[Availability]]]:
    businesses_by_name: dict[str, Business] = {}
    services_by_business: dict[str, Service] = {}
    availability_by_business: dict[str, list[Availability]] = {}

    for row in _BUSINESSES:
        business_destination = destinations_by_name.get(row["destination"])
        existing_business = await session.execute(select(Business).where(Business.name == row["name"]))
        business = existing_business.scalar_one_or_none()
        is_new_business = business is None
        if business is None:
            business = Business(
                owner_user_id=users_by_email[row["owner_email"]].id,
                name=row["name"],
                category=row["category"],
                destination_id=business_destination.id if business_destination else None,
                location=f"SRID=4326;POINT({row['lon']} {row['lat']})",
            )
            session.add(business)
            await session.flush()
        businesses_by_name[row["name"]] = business

        existing_profile = await session.execute(
            select(BusinessProfile).where(BusinessProfile.business_id == business.id)
        )
        profile = existing_profile.scalar_one_or_none()
        category_image = _CATEGORY_IMAGES.get(row["category"])
        if profile is None:
            session.add(
                BusinessProfile(
                    business_id=business.id, description=row["description"], image_url=category_image
                )
            )
        elif profile.image_url is None:
            # Backfill for businesses seeded before category images existed
            # — never overwrites a real value the owner (or a later re-seed
            # with a different category image) already set.
            profile.image_url = category_image

        existing_service = None
        if not is_new_business:
            result = await session.execute(
                select(Service).where(Service.business_id == business.id, Service.name == row["service_name"])
            )
            existing_service = result.scalar_one_or_none()
        service = existing_service
        if service is None:
            service = Service(business_id=business.id, name=row["service_name"], base_price=row["base_price"])
            session.add(service)
            await session.flush()
        services_by_business[row["name"]] = service

        slots = (
            (
                await session.execute(
                    select(Availability).where(Availability.service_id == service.id).order_by(Availability.starts_at)
                )
            )
            .scalars()
            .all()
        )
        if not slots:
            new_slots = []
            for offset_days in (1, 2, 3):
                starts_at = datetime.now(UTC) + timedelta(days=offset_days, hours=10)
                slot = Availability(
                    service_id=service.id,
                    starts_at=starts_at,
                    ends_at=starts_at + timedelta(hours=2),
                    capacity=row["slot_capacity"],
                )
                session.add(slot)
                new_slots.append(slot)
            await session.flush()
            slots = new_slots
        availability_by_business[row["name"]] = list(slots)

        if is_new_business:
            verification = Verification(
                subject_type=VerificationSubjectType.BUSINESS,
                subject_id=business.id,
                submitted_by_user_id=users_by_email[row["owner_email"]].id,
                status=VerificationStatus.PENDING,
            )
            session.add(verification)
            await session.flush()

            target_status = row["verification"]
            if target_status == VerificationStatus.APPROVED:
                now = datetime.now(UTC)
                verification.status = VerificationStatus.APPROVED
                verification.reviewed_by_user_id = verifier.id
                verification.reviewed_at = now
                session.add(
                    Credential(
                        verification_id=verification.id,
                        subject_type=VerificationSubjectType.BUSINESS,
                        subject_id=business.id,
                        issued_at=now,
                    )
                )
                business.is_verified = True
            elif target_status == VerificationStatus.REJECTED:
                verification.status = VerificationStatus.REJECTED
                verification.reviewed_by_user_id = verifier.id
                verification.reviewed_at = datetime.now(UTC)
                verification.rejection_reason = row["rejection_reason"]
            # PENDING: leave as submitted, undecided — a real queue entry.
            await session.flush()

    await session.commit()
    return businesses_by_name, services_by_business, availability_by_business


async def _seed_guides(
    session: AsyncSession, users_by_email: dict[str, User], destinations_by_name: dict[str, Destination], verifier: User
) -> dict[str, Guide]:
    guides_by_email: dict[str, Guide] = {}
    for row in _GUIDES:
        guide_destination = destinations_by_name.get(row["destination"])
        user = users_by_email[row["user_email"]]
        existing_guide = await session.execute(select(Guide).where(Guide.user_id == user.id))
        guide = existing_guide.scalar_one_or_none()
        is_new_guide = guide is None
        if guide is None:
            guide = Guide(
                user_id=user.id,
                languages=row["languages"],
                specialties=row["specialties"],
                destination_id=guide_destination.id if guide_destination else None,
                bio=row["bio"],
            )
            session.add(guide)
            await session.flush()
        guides_by_email[row["user_email"]] = guide

        if is_new_guide:
            verification = Verification(
                subject_type=VerificationSubjectType.GUIDE,
                subject_id=guide.id,
                submitted_by_user_id=user.id,
                status=VerificationStatus.PENDING,
            )
            session.add(verification)
            await session.flush()

            if row["verification"] == VerificationStatus.APPROVED:
                now = datetime.now(UTC)
                verification.status = VerificationStatus.APPROVED
                verification.reviewed_by_user_id = verifier.id
                verification.reviewed_at = now
                session.add(
                    Credential(
                        verification_id=verification.id,
                        subject_type=VerificationSubjectType.GUIDE,
                        subject_id=guide.id,
                        issued_at=now,
                    )
                )
                guide.is_verified = True
            await session.flush()

    await session.commit()
    return guides_by_email


async def _seed_reviews(
    session: AsyncSession,
    users_by_email: dict[str, User],
    businesses_by_name: dict[str, Business],
    guides_by_email: dict[str, Guide],
    destinations_by_name: dict[str, Destination],
) -> None:
    for author_email, target_type, target_name, rating, body in _REVIEWS:
        author = users_by_email[author_email]
        if target_type == ReviewTargetType.BUSINESS:
            target_id = businesses_by_name[target_name].id
        elif target_type == ReviewTargetType.GUIDE:
            target_id = guides_by_email[target_name].id
        else:
            review_destination = destinations_by_name.get(target_name)
            if review_destination is None:
                continue
            target_id = review_destination.id

        existing_review = await session.execute(
            select(Review).where(
                Review.author_user_id == author.id,
                Review.target_type == target_type,
                Review.target_id == target_id,
            )
        )
        if existing_review.scalar_one_or_none() is not None:
            continue

        review = Review(author_user_id=author.id, target_type=target_type, target_id=target_id, rating=rating, body=body)
        session.add(review)
        await session.flush()

        try:
            outcome = await analyze_review(rating=rating, body=body)
            now = datetime.now(UTC)
            session.add(
                ReviewAnalysis(
                    review_id=review.id,
                    authenticity_score=outcome.authenticity_score,
                    flags={"flags": outcome.flags, "reason": outcome.reason},
                    model_version=outcome.model_version,
                    analyzed_at=now,
                )
            )
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
            print(f"Analyzed review on {target_name!r}: authenticity={outcome.authenticity_score:.2f} flags={outcome.flags}")
        except AppError as exc:
            print(f"Skipping AI review analysis for {target_name!r} — {exc.message}")
        await session.commit()


async def _seed_fraud_reports(
    session: AsyncSession, users_by_email: dict[str, User], businesses_by_name: dict[str, Business]
) -> None:
    for reporter_email, subject_type, subject_name, description in _FRAUD_REPORTS:
        reporter = users_by_email[reporter_email]
        subject_id = businesses_by_name[subject_name].id if subject_name and subject_type == "business" else None

        existing_case = await session.execute(
            select(FraudCase).where(FraudCase.reported_by_user_id == reporter.id, FraudCase.description == description)
        )
        if existing_case.scalar_one_or_none() is not None:
            continue

        case = FraudCase(
            reported_by_user_id=reporter.id,
            subject_type=subject_type,
            subject_id=subject_id,
            description=description,
            status=FraudCaseStatus.OPEN,
        )
        session.add(case)
        await session.flush()

        try:
            classification = await classify_fraud_report(subject_type=subject_type, description=description)
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
            print(f"Classified fraud report from {reporter_email!r}: {classification.signal_type} ({classification.confidence:.2f})")
        except AppError as exc:
            print(f"Skipping AI fraud classification for {reporter_email!r} — {exc.message}")
        await session.commit()


async def _seed_bookings(
    session: AsyncSession,
    users_by_email: dict[str, User],
    services_by_business: dict[str, Service],
    availability_by_business: dict[str, list[Availability]],
) -> None:
    for tourist_email, business_name, party_size in _BOOKINGS:
        tourist = users_by_email[tourist_email]
        service = services_by_business[business_name]
        availability = availability_by_business[business_name][0]

        existing_booking = await session.execute(
            select(Booking).where(
                Booking.user_id == tourist.id,
                Booking.service_id == service.id,
                Booking.availability_id == availability.id,
            )
        )
        if existing_booking.scalar_one_or_none() is not None:
            continue

        total_amount = float(service.base_price) * party_size if service.base_price is not None else None
        booking = Booking(
            user_id=tourist.id,
            service_id=service.id,
            availability_id=availability.id,
            party_size=party_size,
            status=BookingStatus.CONFIRMED,
            total_amount=total_amount,
            currency=service.currency,
        )
        session.add(booking)
        availability.booked_count += party_size
        await session.flush()
        session.add(Ticket(booking_id=booking.id))

    await session.commit()


async def seed_demo() -> None:
    async with get_session_factory()() as session:
        await session.execute(text("SET app.user_role = 'service'"))

        users_by_email = await _seed_accounts(session)
        verifier = users_by_email["verifier.demo@travindi-demo.in"]

        destination_names = {row["destination"] for row in _BUSINESSES} | {row["destination"] for row in _GUIDES}
        destinations_by_name = await _load_destinations(session, destination_names)

        businesses_by_name, services_by_business, availability_by_business = await _seed_businesses(
            session, users_by_email, destinations_by_name, verifier
        )
        guides_by_email = await _seed_guides(session, users_by_email, destinations_by_name, verifier)

        await _seed_reviews(session, users_by_email, businesses_by_name, guides_by_email, destinations_by_name)
        await _seed_fraud_reports(session, users_by_email, businesses_by_name)
        await _seed_bookings(session, users_by_email, services_by_business, availability_by_business)

    await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(seed_demo())
