"""Guardrails — schema validation + prompt-injection isolation, per the
pipeline in docs/00-planning/01-project-master-model.md §N ("Guardrails:
schema validation, prompt-injection isolation, tool-credential scoping").

Tool-credential scoping isn't a helper here — it's structural: the planner
agent's only DB reads are the read-only queries app/domains/travel/planner.py
runs itself (candidate attractions scoped to one destination, knowledge
chunks via RAG). The LLM never gets a DB connection, a raw SQL tool, or
access beyond what's assembled into its prompt.
"""

from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.core.errors import AppError

T = TypeVar("T", bound=BaseModel)


def wrap_untrusted(label: str, content: str) -> str:
    """Delimits externally-influenced text (user free-text prompts,
    retrieved knowledge-base content) so the system prompt can tell Claude
    to treat it as data to reason about, never as instructions to follow —
    the isolation half of prompt-injection defense. The other half is the
    system prompt itself explicitly saying so (see
    app/domains/travel/planner.py's SYSTEM_PROMPT)."""
    return f"<{label}>\n{content}\n</{label}>"


def validate_tool_output(data: dict, schema: type[T]) -> T:
    """Defense-in-depth schema validation of the LLM's structured tool-call
    output. Anthropic's `strict: true` tool definitions already guarantee
    JSON-schema conformance server-side (platform.claude.com/docs/en/
    agents-and-tools/tool-use/strict-tool-use) — this re-validates
    independently rather than trusting that guarantee blindly, and is what
    actually enforces the *semantic* constraints Pydantic can check that a
    JSON Schema can't (e.g. cross-field rules), never a silent pass-through.
    Raises a clear AppError, never lets malformed AI output reach the DB."""
    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        raise AppError(
            code="AI_OUTPUT_INVALID",
            message="The AI planner produced output that failed schema validation.",
            status_code=502,
            details={"errors": exc.errors()},
            retryable=True,
        ) from exc
