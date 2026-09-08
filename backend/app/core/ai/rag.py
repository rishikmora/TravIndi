"""RAG retrieval — hand-rolled, no framework, per the confirmed Phase 12
decision (overriding Assumption C2's LlamaIndex default): the actual scope
here is one embedding call + one pgvector cosine-similarity SQL query, which
LlamaIndex/LangChain would otherwise wrap in their own retriever/query-engine
abstractions for no real benefit at this scale.

Embeds locally via `sentence-transformers` (no embeddings API key was
available, and Anthropic has no embeddings API of its own); retrieves via
pgvector's `cosine_distance` comparator (pgvector-python's SQLAlchemy
extension — verified against github.com/pgvector/pgvector-python's README),
which compiles to the `<=>` operator against the HNSW index already created
in Phase 7 (app/domains/knowledge/models.py `ix_knowledge_chunks_embedding`).
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai.gateway import get_embedding_model
from app.domains.knowledge.models import KnowledgeChunk, KnowledgeDocument


async def embed_text(text: str) -> list[float]:
    """`SentenceTransformer.encode` is synchronous and CPU-bound — running
    it directly on the event loop would block every other in-flight
    request, so it goes through a worker thread via `asyncio.to_thread`."""
    model = get_embedding_model()
    embedding = await asyncio.to_thread(model.encode, text)
    return embedding.tolist()


async def retrieve_knowledge(
    session: AsyncSession,
    query_embedding: list[float],
    *,
    destination_id: str | None = None,
    top_k: int = 5,
) -> list[KnowledgeChunk]:
    """Nearest-neighbor chunks by cosine distance, optionally scoped to one
    destination's documents. Returns real rows or an empty list — never
    fabricates a result when nothing is close enough; callers decide what
    "nothing relevant" means for their prompt."""
    query = select(KnowledgeChunk).order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
    if destination_id is not None:
        query = query.join(KnowledgeDocument, KnowledgeChunk.document_id == KnowledgeDocument.id).where(
            KnowledgeDocument.destination_id == destination_id
        )
    query = query.limit(top_k)
    result = await session.execute(query)
    return list(result.scalars().all())
