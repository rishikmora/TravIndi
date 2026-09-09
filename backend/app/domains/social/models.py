"""Social Tourism domain models — `social` schema (Feature Blueprint P2
domain #16). Deliberately just one new table: most of this blueprint domain
overlaps with real infrastructure built elsewhere in this pass — "group
trip creation"/"shared itineraries" are `group_travel` + `travel.trips`,
"community reviews" are `trust.reviews`, "public trip journals" are
`travel.trips.is_public` (see that model's docstring) — so only the
genuinely new concept lives here: a lightweight, free-form public
discussion thread per destination, distinct from a formal rated `Review`.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import UUIDPKMixin


class DestinationDiscussionPost(UUIDPKMixin, Base):
    __tablename__ = "destination_discussion_posts"
    __table_args__ = (
        Index("ix_destination_discussion_posts_destination_created", "destination_id", "created_at"),
        {"schema": "social"},
    )

    destination_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tourism.destinations.id", ondelete="CASCADE"), nullable=False
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("identity.users.id", ondelete="CASCADE"), nullable=False)
    body: Mapped[str] = mapped_column(String(2000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
