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
    "Taj Mahal": (
        "The Taj Mahal in Agra, Uttar Pradesh, is a white marble mausoleum built by the "
        "Mughal emperor Shah Jahan in memory of his wife Mumtaz Mahal. A UNESCO World "
        "Heritage Site and one of the most recognized monuments in the world, it draws "
        "large crowds year-round, with sunrise and sunset among the most popular (and "
        "most crowded) viewing times. Agra Fort, another UNESCO-listed Mughal fortress a "
        "short distance away, offers a distant view of the Taj Mahal across the Yamuna "
        "River. Mehtab Bagh, a garden complex on the opposite riverbank, is a quieter spot "
        "for viewing the monument. The city is hot for much of the year, and visitors are "
        "advised to carry water and sun protection."
    ),
    "Dashashwamedh Ghat": (
        "Dashashwamedh Ghat is the main and most visited ghat (riverfront steps) on the "
        "Ganges in Varanasi, Uttar Pradesh — one of the oldest continuously inhabited "
        "cities in the world and a major center of Hindu pilgrimage. It is best known for "
        "the nightly Ganga Aarti, a ritual fire ceremony performed by priests on the "
        "riverbank that draws large crowds of pilgrims and tourists. The nearby Kashi "
        "Vishwanath Temple, dedicated to Lord Shiva, is one of the most important Hindu "
        "temples in India. Sarnath, a Buddhist heritage site where the Buddha is said to "
        "have given his first sermon, lies a short distance from the city center. The "
        "ghats and surrounding old-city lanes are narrow and very crowded, especially "
        "during evening aarti and religious festivals."
    ),
    "Amber Fort": (
        "Amber Fort (Amer Fort) is a large hilltop fort-palace near Jaipur, Rajasthan, "
        "built from pale yellow and pink sandstone and white marble, known for its "
        "elaborate mirror-work hall (Sheesh Mahal) and courtyards. It is one of "
        "Rajasthan's most visited forts and part of the Hill Forts of Rajasthan UNESCO "
        "World Heritage Site. Jaigarh Fort, connected to Amber Fort by a walkway, sits "
        "higher on the same ridge and overlooks the city. Jal Mahal, a palace that "
        "appears to float in the middle of Man Sagar Lake, is a popular photo stop on the "
        "road between Jaipur and Amber Fort. The fort involves significant walking on "
        "uneven stone surfaces."
    ),
    "Khajuraho Group of Monuments": (
        "The Khajuraho Group of Monuments, in Madhya Pradesh, is a UNESCO World Heritage "
        "Site comprising Hindu and Jain temples built between roughly the 10th and 12th "
        "centuries by the Chandela dynasty, renowned for their intricate sculptural "
        "artwork. The Western Group of Temples is the largest and best-preserved cluster "
        "and the main visitor area. Khajuraho is a relatively small town, and visitor "
        "numbers are noticeably lower than at India's more famous monuments, making it a "
        "quieter heritage destination. Raneh Falls, a canyon of volcanic rock on the Ken "
        "River, is a natural-heritage day trip from the temple complex."
    ),
    "Hampi": (
        "Hampi, in Karnataka, is a UNESCO World Heritage Site and the site of the ruined "
        "city of Vijayanagara, once the capital of the Vijayanagara Empire. The site "
        "spreads across a large, boulder-strewn landscape and includes the Virupaksha "
        "Temple, an active temple dedicated to Shiva and one of the oldest structures at "
        "the site, and the Vittala Temple, known for its ornate stone chariot and "
        "musical pillars. Hampi is popular with both heritage tourists and travelers "
        "drawn to its landscape for bouldering and cycling between monuments. Distances "
        "between individual ruins can be significant, and much of the site involves "
        "walking in open sun."
    ),
    "Golden Temple": (
        "The Golden Temple (Harmandir Sahib) in Amritsar, Punjab, is the holiest "
        "gurdwara of Sikhism, its upper floors gilded in gold and set within a sacred "
        "pool (the Amrit Sarovar). It operates a langar (community kitchen) that serves "
        "free meals to all visitors regardless of faith, one of the largest such kitchens "
        "in the world. Jallianwala Bagh, a public garden and memorial to a 1919 massacre "
        "during British colonial rule, is a short walk away. The Wagah Border, where a "
        "daily flag-lowering ceremony is held between India and Pakistan, is a popular "
        "day trip from Amritsar. Visitors to the Golden Temple are expected to cover "
        "their heads and remove footwear before entering."
    ),
    "Meenakshi Amman Temple": (
        "The Meenakshi Amman Temple in Madurai, Tamil Nadu, is a large, historic Hindu "
        "temple dedicated to the goddess Meenakshi (a form of Parvati) and her consort "
        "Sundareswarar, known for its towering, intricately carved gopurams (gateway "
        "towers). Madurai is one of the oldest continuously inhabited cities in India, "
        "and the temple sits at the heart of its old city. Thirumalai Nayakkar Palace, a "
        "17th-century Indo-Saracenic palace, and the Gandhi Memorial Museum, housed in a "
        "former palace and documenting the Indian independence movement, are both nearby. "
        "The temple complex is crowded throughout the day, with photography restricted in "
        "some inner areas."
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
