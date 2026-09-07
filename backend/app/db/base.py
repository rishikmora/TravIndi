"""Declarative base shared by every domain module's models.

Phase 7 populates backend/app/domains/*/models.py; each module's models must be
imported here (or in alembic/env.py) so Alembic autogenerate can see them via
Base.metadata. Nothing is defined yet — this is Phase 6 scaffolding only.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
