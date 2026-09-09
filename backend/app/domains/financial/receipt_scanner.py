"""Real receipt OCR (Feature Blueprint P2 #14 "Receipt OCR") — Claude's own
multimodal vision capability reads a photographed receipt directly, same
approach as `app/domains/knowledge/translation.py`'s image translation (one
model call, no separate OCR service). This only ever returns a *draft* for
the user to review/edit before it becomes a real `Expense` row
(`app/domains/financial/router.py`'s `/receipts/scan` is a separate call
from `/expenses` — scanning never silently creates a financial record).
"""

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict

from app.core.ai.gateway import get_anthropic_client
from app.core.ai.guardrails import validate_tool_output
from app.core.ai.router import route_for_task
from app.core.errors import AppError

_SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

_TOOL_NAME = "submit_receipt_extraction"
_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "no_receipt_detected": {
            "type": "boolean",
            "description": "true if the image doesn't look like a receipt or bill at all.",
        },
        "amount": {"type": "number", "description": "The total amount charged. 0 if not legible."},
        "currency": {
            "type": "string",
            "description": "ISO 4217 currency code (e.g. INR, USD). Guess INR if no currency symbol is visible and the receipt looks Indian; otherwise your best guess.",
        },
        "vendor": {"type": "string", "description": "Business/vendor name printed on the receipt, or empty string."},
        "category_guess": {
            "type": "string",
            "enum": ["ACCOMMODATION", "FOOD", "TRANSPORT", "SHOPPING", "ACTIVITIES", "OTHER"],
        },
        "date_text": {"type": "string", "description": "The date exactly as printed on the receipt, or empty string if none visible."},
    },
    "required": ["no_receipt_detected", "amount", "currency", "vendor", "category_guess", "date_text"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = """You extract structured data from a photographed travel receipt or bill for \
an expense-tracking feature. Call submit_receipt_extraction exactly once with your best reading \
of the image. Never guess wildly — if a field truly isn't legible, use an empty string (or 0 for \
amount) rather than inventing a plausible-looking value. You are not deciding anything, only \
transcribing what's visible; a human reviews and can edit every field before it's saved."""


class _ReceiptExtractionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    no_receipt_detected: bool
    amount: float
    currency: str
    vendor: str
    category_guess: str
    date_text: str


@dataclass
class ReceiptScanResult:
    no_receipt_detected: bool
    amount: float
    currency: str
    vendor: str
    category_guess: str
    date_text: str
    model_version: str


async def scan_receipt(*, image_base64: str, media_type: str) -> ReceiptScanResult:
    if media_type not in _SUPPORTED_IMAGE_TYPES:
        raise AppError(code="UNSUPPORTED_IMAGE_TYPE", message=f"Unsupported image media type: {media_type}.", status_code=422)

    route = route_for_task("receipt_ocr")
    client = get_anthropic_client()
    response = await client.messages.create(
        model=route.model,
        max_tokens=512,
        system=_SYSTEM_PROMPT,
        tools=[{"name": _TOOL_NAME, "description": "Submit the extracted receipt fields.", "strict": True, "input_schema": _TOOL_SCHEMA}],
        tool_choice={"type": "tool", "name": _TOOL_NAME},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_base64}},
                    {"type": "text", "text": "Extract the receipt fields from this image."},
                ],
            }
        ],
    )

    tool_use = next((block for block in response.content if block.type == "tool_use"), None)
    if tool_use is None:
        raise AppError(code="RECEIPT_SCAN_FAILED", message="Could not read this receipt.", status_code=502, retryable=True)
    result = validate_tool_output(tool_use.input, _ReceiptExtractionResult)
    return ReceiptScanResult(
        no_receipt_detected=result.no_receipt_detected,
        amount=result.amount,
        currency=result.currency or "INR",
        vendor=result.vendor,
        category_guess=result.category_guess,
        date_text=result.date_text,
        model_version=route.model,
    )
