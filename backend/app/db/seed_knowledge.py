"""Phase 12 knowledge-base seeding — kept separate from app/db/seed.py
because this step embeds every chunk via a local `sentence-transformers`
model (app/core/ai/gateway.py's `get_embedding_model`), which downloads
model weights on first use; seed.py's destinations/attractions are pure DB
writes with no such dependency.

Content below is real, general, publicly-known tourism information — no
fabricated statistics (ticket prices, visitor counts) that would need a
citation and go stale. Safe to re-run: skips any (destination, title) pair
that's already been ingested.

Usage: `python -m app.db.seed_knowledge` (needs DATABASE_URL set, e.g. via
backend/.env; run `python -m app.db.seed` first so the destinations exist
to attach to). No API key needed — the embedding model runs locally.
"""

import asyncio

from sqlalchemy import select, text

from app.core.ai.rag import embed_text
from app.db.session import get_engine, get_session_factory
from app.domains.knowledge.models import KnowledgeChunk, KnowledgeDocument, KnowledgeSource
from app.domains.tourism.models import Destination

_SOURCE_NAME = "TravIndi Editorial"

_SEED_KNOWLEDGE = {
    "India Gate": (
        "India Gate is a war memorial in New Delhi, built to honor soldiers of the "
        "British Indian Army who died in World War I. It stands at the eastern end of "
        "Rajpath (Kartavya Path), a ceremonial boulevard, and is one of Delhi's most "
        "recognized landmarks. The nearby National War Memorial honors more recent "
        "Indian Armed Forces personnel. The area draws large evening crowds, especially "
        "on weekends and around national holidays such as Republic Day (26 January), "
        "when Rajpath hosts India's Republic Day parade — visitors should expect heavier "
        "pedestrian traffic and tighter security around that period."
    ),
    "Gateway of India": (
        "The Gateway of India is a historic arch monument on the Mumbai waterfront, "
        "overlooking the Arabian Sea, built in the early 20th century to commemorate the "
        "landing of King George V and Queen Mary. It is one of Mumbai's most visited "
        "landmarks and a common departure point for ferries to Elephanta Caves, a UNESCO "
        "World Heritage Site with ancient rock-cut cave temples on an island reachable by "
        "boat. The Chhatrapati Shivaji Maharaj Vastu Sangrahalaya (formerly the Prince of "
        "Wales Museum), a short distance away, holds collections of Indian art, "
        "archaeology, and natural history. The waterfront area is busy with tourists, "
        "vendors, and boat operators, particularly in the evening."
    ),
    "Mysore Palace": (
        "Mysore Palace (Amba Vilas Palace) in Mysuru, Karnataka, was the official "
        "residence of the Wadiyar dynasty and is one of India's most visited palaces, "
        "known for its Indo-Saracenic architecture and its illumination during Dasara, "
        "Mysuru's major annual festival held in September/October, which brings a large "
        "seasonal increase in visitors to the city. Chamundi Hills, a nearby hill with a "
        "temple dedicated to the goddess Chamundeshwari, offers views over the city and is "
        "a popular day trip from the palace. Mysuru Zoo, one of India's older zoos, is "
        "also nearby."
    ),
}


async def seed_knowledge() -> None:
    async with get_session_factory()() as session:
        await session.execute(text("SET app.user_role = 'service'"))

        existing_source = await session.execute(select(KnowledgeSource).where(KnowledgeSource.name == _SOURCE_NAME))
        source = existing_source.scalar_one_or_none()
        if source is None:
            source = KnowledgeSource(name=_SOURCE_NAME, publisher="TravIndi", approval_status="APPROVED")
            session.add(source)
            await session.flush()

        for destination_name, content in _SEED_KNOWLEDGE.items():
            destination_result = await session.execute(
                select(Destination).where(Destination.name == destination_name)
            )
            destination = destination_result.scalar_one_or_none()
            if destination is None:
                print(f"Skipping {destination_name!r} — run `python -m app.db.seed` first.")
                continue

            existing_doc = await session.execute(
                select(KnowledgeDocument).where(
                    KnowledgeDocument.destination_id == destination.id,
                    KnowledgeDocument.title == destination_name,
                )
            )
            if existing_doc.scalar_one_or_none() is not None:
                continue

            document = KnowledgeDocument(
                source_id=source.id,
                title=destination_name,
                language="en",
                topic="general_tourism",
                destination_id=destination.id,
            )
            session.add(document)
            await session.flush()

            embedding = await embed_text(content)
            session.add(
                KnowledgeChunk(
                    document_id=document.id,
                    content=content,
                    chunk_metadata={"destination": destination_name},
                    embedding=embedding,
                )
            )
            print(f"Embedded knowledge chunk for {destination_name!r}.")

        await session.commit()
    await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(seed_knowledge())
