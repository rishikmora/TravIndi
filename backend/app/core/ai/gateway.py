"""AI Gateway — the first pipeline stage in
docs/00-planning/01-project-master-model.md §N: AI Gateway (auth, quota,
cost, tracing) -> Model Router -> Agents -> Tools + RAG -> Guardrails ->
Policy Gate -> Human Workflow -> Action.

Scope, honestly stated: this is a single-LLM-provider MVP, not a
multi-tenant gateway product. "Auth" here means "clear config error if the
API key is missing" (never a silent bypass, matching app/core/security.py's
KEYCLOAK_URL/KEYCLOAK_REALM pattern). "Cost"/"tracing" means real token
usage is returned to the caller to persist (see app/domains/travel/planner.py
writing it into knowledge.ai_messages/ai_tool_calls) — there is no separate
cost-aggregation dashboard; that's genuinely unbuilt, not hidden. "Quota"
(per-user rate limiting) is explicitly Phase 19 scope (assumption C5's
20/min AI figure) and is NOT implemented here.

Embeddings are local (`sentence-transformers`), not a gatewayed API call —
no embeddings API key was available (OpenAI) and Anthropic has no
embeddings API of its own — so `get_embedding_model` below has no API-key
check to make; the only failure mode is the model weights failing to
download/load, which surfaces as whatever `sentence_transformers` raises.
"""

from dataclasses import dataclass
from functools import lru_cache

from anthropic import AsyncAnthropic
from sentence_transformers import SentenceTransformer

from app.core.config import get_settings
from app.core.errors import AppError


@lru_cache
def get_anthropic_client() -> AsyncAnthropic:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise AppError(
            code="AI_NOT_CONFIGURED",
            message="ANTHROPIC_API_KEY is not configured on this deployment.",
            status_code=500,
        )
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


@lru_cache
def get_embedding_model() -> SentenceTransformer:
    """Loaded once per process (model weights download to a local cache on
    first use, then load from disk) — `sentence_transformers.encode()` is
    synchronous/CPU-bound, so callers (app/core/ai/rag.py) run it via
    `asyncio.to_thread` rather than blocking the event loop."""
    settings = get_settings()
    return SentenceTransformer(settings.embedding_model_name)


@dataclass(frozen=True)
class Usage:
    """Real token counts from the provider response — persisted by callers,
    never estimated. `cost_usd` is computed from the model's own published
    per-token price, not measured/billed directly."""

    input_tokens: int
    output_tokens: int
    model: str
    cost_usd: float | None = None


# Anthropic per-model USD price per million tokens (input, output) — from
# platform.claude.com/docs/en/about-claude/pricing, checked 2026-09-07.
# Update if the model or its price changes; this is display/audit-trail
# data only, never used to block a request (no budget enforcement exists).
_ANTHROPIC_PRICE_PER_MTOK = {
    "claude-sonnet-5": (2.0, 10.0),
}


def price_usage(*, model: str, input_tokens: int, output_tokens: int) -> Usage:
    price = _ANTHROPIC_PRICE_PER_MTOK.get(model)
    cost = None
    if price is not None:
        cost = (input_tokens * price[0] + output_tokens * price[1]) / 1_000_000
    return Usage(input_tokens=input_tokens, output_tokens=output_tokens, model=model, cost_usd=cost)
