"""Standalone CLI wrapper around `app.db.test_data_cleanup`, for a database
that accumulated test-fixture businesses before the session-scoped autouse
fixture in `tests/conftest.py` existed (or if that fixture is ever skipped
with `-p no:cacheprovider`-style flags). Ordinary local development no
longer needs to run this manually — `pytest tests/` cleans up after itself
now. Run: `python -m scripts.cleanup_test_businesses`.
"""

import asyncio

from app.db.session import get_session_factory
from app.db.test_data_cleanup import cleanup_test_business_pollution


async def main() -> None:
    async with get_session_factory()() as session:
        counts = await cleanup_test_business_pollution(session)
        print(counts)


if __name__ == "__main__":
    asyncio.run(main())
