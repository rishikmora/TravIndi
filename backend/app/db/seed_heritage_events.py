"""Real cultural-calendar seed data — Feature Blueprint P2 domain #7 Smart
Heritage ("Local festival discovery", "Cultural calendar"). Each event
below is a real, well-documented Indian festival genuinely associated with
its destination — not invented. Exact dates shift yearly (most are tied to
lunar/regional calendars — Baisakhi and Republic Day are the only fixed-date
exceptions here), so these are illustrative single instances roughly a year
out from when this was written, not a claim of precise real-time accuracy —
same "no fabricated statistics" posture as `seed_knowledge.py`.

Usage: `python -m app.db.seed_heritage_events` (run `python -m app.db.seed`
first so destinations exist to attach to). Safe to re-run: skips any
(destination, event name) pair that already exists.
"""

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select, text

from app.db.session import get_engine, get_session_factory
from app.domains.tourism.models import Destination, TourismEvent

_SEED_EVENTS: dict[str, list[tuple[str, datetime, datetime, int | None]]] = {
    "India Gate": [
        ("Republic Day Parade", datetime(2027, 1, 26, 4, 0, tzinfo=UTC), datetime(2027, 1, 26, 8, 0, tzinfo=UTC), 200_000),
    ],
    "Taj Mahal": [
        ("Taj Mahotsav", datetime(2027, 2, 18, tzinfo=UTC), datetime(2027, 2, 27, tzinfo=UTC), None),
    ],
    "Khajuraho Group of Monuments": [
        ("Khajuraho Dance Festival", datetime(2027, 2, 20, tzinfo=UTC), datetime(2027, 2, 26, tzinfo=UTC), None),
    ],
    "Amber Fort": [
        ("Teej Festival", datetime(2027, 9, 5, tzinfo=UTC), datetime(2027, 9, 7, tzinfo=UTC), None),
    ],
    "Meenakshi Amman Temple": [
        ("Chithirai Festival (Meenakshi Thirukalyanam)", datetime(2027, 4, 12, tzinfo=UTC), datetime(2027, 4, 26, tzinfo=UTC), None),
    ],
    "Golden Temple": [
        ("Baisakhi", datetime(2027, 4, 14, tzinfo=UTC), datetime(2027, 4, 14, 18, 0, tzinfo=UTC), None),
    ],
    "Dashashwamedh Ghat": [
        ("Dev Deepawali", datetime(2027, 11, 24, tzinfo=UTC), datetime(2027, 11, 24, 23, 0, tzinfo=UTC), None),
    ],
    "Hampi": [
        ("Hampi Utsav", datetime(2027, 11, 3, tzinfo=UTC), datetime(2027, 11, 5, tzinfo=UTC), None),
    ],
    "Mysore Palace": [
        ("Mysuru Dasara", datetime(2027, 10, 1, tzinfo=UTC), datetime(2027, 10, 11, tzinfo=UTC), None),
    ],
    "Gateway of India": [
        ("Ganesh Chaturthi Visarjan", datetime(2027, 9, 15, tzinfo=UTC), datetime(2027, 9, 15, 23, 0, tzinfo=UTC), None),
    ],
}


async def seed_heritage_events() -> None:
    async with get_session_factory()() as session:
        await session.execute(text("SET app.user_role = 'service'"))

        for destination_name, events in _SEED_EVENTS.items():
            destination_result = await session.execute(select(Destination).where(Destination.name == destination_name))
            destination = destination_result.scalar_one_or_none()
            if destination is None:
                print(f"Skipping {destination_name!r} — run `python -m app.db.seed` first.")
                continue

            for name, starts_at, ends_at, expected_attendance in events:
                existing = await session.execute(
                    select(TourismEvent).where(TourismEvent.destination_id == destination.id, TourismEvent.name == name)
                )
                if existing.scalar_one_or_none() is not None:
                    continue
                session.add(
                    TourismEvent(
                        destination_id=destination.id, name=name, starts_at=starts_at, ends_at=ends_at,
                        expected_attendance=expected_attendance,
                    )
                )
                print(f"Added event {name!r} for {destination_name!r}.")

        await session.commit()
    await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(seed_heritage_events())
