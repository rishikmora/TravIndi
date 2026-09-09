"""Gamification catalog seed — badges and challenges. Separate from
`seed_demo.py` because this is platform-defined *catalog* data (what badges
and challenges exist at all), not user/business demo data; it needs to exist
before any real check-in/booking/review can award a badge or advance a
challenge. Pure DB writes, no AI/embedding calls, so it's instant like
`seed.py`. Safe to re-run: skips any (code) that already exists.

Usage: `python -m app.db.seed_gamification`
"""

import asyncio
from typing import Any

from sqlalchemy import select, text

from app.db.session import get_engine, get_session_factory
from app.domains.gamification.models import Badge, Challenge, GamificationCategory

_BADGES: list[dict[str, Any]] = [
    {
        "code": "first_steps",
        "name": "First Steps",
        "description": "Checked in at your first real destination.",
        "category": GamificationCategory.EXPLORATION,
        "icon_key": "footprints",
        "points_value": 10,
    },
    {
        "code": "explorer",
        "name": "Explorer",
        "description": "Checked in at 5 different destinations.",
        "category": GamificationCategory.EXPLORATION,
        "icon_key": "compass",
        "points_value": 50,
    },
    {
        "code": "trailblazer",
        "name": "Trailblazer",
        "description": "Checked in at 10 different destinations.",
        "category": GamificationCategory.EXPLORATION,
        "icon_key": "map",
        "points_value": 100,
    },
    {
        "code": "local_champion",
        "name": "Local Champion",
        "description": "Booked 3 different KYC-verified local businesses.",
        "category": GamificationCategory.LOCAL_ECONOMY,
        "icon_key": "storefront",
        "points_value": 50,
    },
    {
        "code": "community_voice",
        "name": "Community Voice",
        "description": "Wrote 5 reviews to help other travelers.",
        "category": GamificationCategory.COMMUNITY,
        "icon_key": "megaphone",
        "points_value": 30,
    },
    {
        "code": "eco_traveler",
        "name": "Eco Traveler",
        "description": "Booked 2 different authority-certified eco-friendly businesses.",
        "category": GamificationCategory.RESPONSIBLE_TOURISM,
        "icon_key": "leaf",
        "points_value": 40,
    },
]

_CHALLENGES: list[dict[str, Any]] = [
    {
        "code": "local_economy_supporter",
        "name": "Support 3 Verified Businesses",
        "description": "Book 3 different KYC-verified local businesses.",
        "category": GamificationCategory.LOCAL_ECONOMY,
        "target_count": 3,
        "points_reward": 30,
        "badge_code": "local_champion",
    },
    {
        "code": "community_contributor",
        "name": "Share 5 Reviews",
        "description": "Write 5 reviews on destinations, guides, or businesses.",
        "category": GamificationCategory.COMMUNITY,
        "target_count": 5,
        "points_reward": 20,
        "badge_code": "community_voice",
    },
    {
        "code": "eco_supporter",
        "name": "Support 2 Eco-Certified Businesses",
        "description": "Book 2 different authority-certified eco-friendly businesses.",
        "category": GamificationCategory.RESPONSIBLE_TOURISM,
        "target_count": 2,
        "points_reward": 25,
        "badge_code": "eco_traveler",
    },
]


async def seed_gamification() -> None:
    async with get_session_factory()() as session:
        await session.execute(text("SET app.user_role = 'service'"))

        badges_by_code: dict[str, Badge] = {}
        for row in _BADGES:
            existing = await session.execute(select(Badge).where(Badge.code == row["code"]))
            badge = existing.scalar_one_or_none()
            if badge is None:
                badge = Badge(
                    code=row["code"], name=row["name"], description=row["description"],
                    category=row["category"], icon_key=row["icon_key"], points_value=row["points_value"],
                )
                session.add(badge)
                await session.flush()
            badges_by_code[row["code"]] = badge

        for row in _CHALLENGES:
            existing = await session.execute(select(Challenge).where(Challenge.code == row["code"]))
            if existing.scalar_one_or_none() is not None:
                continue
            session.add(
                Challenge(
                    code=row["code"], name=row["name"], description=row["description"], category=row["category"],
                    target_count=row["target_count"], points_reward=row["points_reward"],
                    badge_id=badges_by_code[row["badge_code"]].id, is_active=True,
                )
            )

        await session.commit()
    await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(seed_gamification())
