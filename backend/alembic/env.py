import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.core.config import get_settings
from app.db.base import Base

# Every domain with models implemented so far. payment/analytics/integration
# are still P1+ with no models yet; their schemas already exist via
# infra/postgres/init.sql. business/trust joined during the P1 feature-gap
# pass (verification, reviews, fraud, business directory); booking joined
# during the Round 2 pass (bookings, tickets — see app/domains/booking/
# models.py for why there's no separate availability_slots table).
from app.domains.booking import models as booking_models  # noqa: F401
from app.domains.business import models as business_models  # noqa: F401
from app.domains.crowd import models as crowd_models  # noqa: F401
from app.domains.emergency import models as emergency_models  # noqa: F401
from app.domains.financial import models as financial_models  # noqa: F401
from app.domains.gamification import models as gamification_models  # noqa: F401
from app.domains.governance import models as governance_models  # noqa: F401
from app.domains.group_travel import models as group_travel_models  # noqa: F401
from app.domains.identity import models as identity_models  # noqa: F401
from app.domains.knowledge import models as knowledge_models  # noqa: F401
from app.domains.location_sharing import models as location_sharing_models  # noqa: F401
from app.domains.lost_found import models as lost_found_models  # noqa: F401
from app.domains.safety import models as safety_models  # noqa: F401
from app.domains.social import models as social_models  # noqa: F401
from app.domains.tourism import models as tourism_models  # noqa: F401
from app.domains.travel import models as travel_models  # noqa: F401
from app.domains.trust import models as trust_models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

_settings = get_settings()
config.set_main_option(
    "sqlalchemy.url", _settings.migrations_database_url or _settings.database_url
)

target_metadata = Base.metadata

# The 14 confirmed application schemas (docs/00-planning/09-database-schema-plan.md)
# plus `gamification`, `lost_found`, and `financial` (added 2026-09-08 for
# the P2 feature-blueprint pass — see
# docs/00-planning/04-feature-priority-matrix.md, not part of the original
# frozen P0/P1 schema plan). `financial` is deliberately separate from the
# existing `payment` schema — `payment` is reserved for a real payment
# gateway integration that was never built (see
# app/domains/booking/models.py); `financial` is user-logged expense
# bookkeeping, a different concept that never touches real money. Postgres
# also has `public`, plus `tiger`/`tiger_data`/`topology` installed by the
# postgis extension itself — without this filter, autogenerate would
# propose dropping PostGIS's own system tables, since they aren't part of
# our metadata.
OWNED_SCHEMAS = {
    "identity", "tourism", "travel", "safety", "emergency", "crowd",
    "business", "booking", "payment", "trust", "knowledge", "analytics",
    "integration", "governance", "gamification", "lost_found", "financial",
    "group_travel", "social", "location_sharing",
}


def include_name(name, type_, parent_names) -> bool:
    if type_ == "schema":
        return name in OWNED_SCHEMAS
    if type_ == "table":
        return parent_names.get("schema_name") in OWNED_SCHEMAS
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
