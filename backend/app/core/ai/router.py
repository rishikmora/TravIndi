"""Model Router — selection + fallback, per the pipeline in
docs/00-planning/01-project-master-model.md §N.

Honest scope note: exactly one provider/model is configured for every task
today (Assumption C2's RAG-library question was resolved as "no framework
needed"; the LLM-provider question was resolved separately as Anthropic
Claude — embeddings are a local `sentence-transformers` model, not a routed
API call at all, see app/core/ai/gateway.py). Fallback across multiple
providers is real infrastructure this project doesn't have yet, so
`route_for_task` returns a single route per task and is NOT a rewritten
no-op — it's the genuine current routing table, structured so a second
route/fallback slots in later without callers changing. `tourist_guide` /
`translation` / `review_moderation` / `fraud_detection` were added during
the P1 feature-gap pass (app/domains/knowledge/guide.py, translation.py,
app/domains/trust/moderation.py) — same model as `planner` today, but kept
as distinct task keys since each is a genuinely separate call site that may
warrant its own model/price tier later.
"""

from dataclasses import dataclass
from typing import Literal

from app.core.config import get_settings

TaskType = Literal[
    "planner", "trip_intent_extraction", "tourist_guide", "translation", "review_moderation", "fraud_detection",
    "receipt_ocr", "heritage_storytelling",
]


@dataclass(frozen=True)
class ModelRoute:
    provider: Literal["anthropic"]
    model: str


def route_for_task(task: TaskType) -> ModelRoute:
    settings = get_settings()
    if task in (
        "planner", "trip_intent_extraction", "tourist_guide", "translation", "review_moderation",
        "fraud_detection", "receipt_ocr", "heritage_storytelling",
    ):
        return ModelRoute(provider="anthropic", model=settings.anthropic_model)
    raise ValueError(f"No route configured for task {task!r}")
