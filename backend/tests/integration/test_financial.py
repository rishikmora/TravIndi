"""Integration tests for Financial Intelligence (Feature Blueprint P2 #14) —
real expense bookkeeping against a trip's real budget, plus real Claude-
vision receipt OCR (app/domains/financial/receipt_scanner.py). No payment
gateway anywhere in this codebase; this is bookkeeping only. Same
ASGITransport `client` fixture convention as tests/integration/
test_ai_planner.py. The receipt-scan test makes one real Anthropic vision
call (a trivial blank PNG, not a full synthetic receipt) — requires
ANTHROPIC_API_KEY; every other test in this file does not.
"""

import uuid
from datetime import UTC, datetime

from httpx import AsyncClient

# A minimal, valid 1x1 transparent PNG — enough to exercise the real
# Claude-vision call end to end without needing an image-generation
# dependency; a blank image should honestly come back as "not a receipt".
_BLANK_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


async def _register_and_login(client: AsyncClient) -> dict:
    email = f"test-{uuid.uuid4().hex[:12]}@example.com"
    password = "Test1234!"
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "account_type": "tourist"},
    )
    assert register.status_code == 201, register.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return {"email": email, **login.json()["data"]}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_unsupported_receipt_image_type_fails_closed(client: AsyncClient) -> None:
    tourist = await _register_and_login(client)
    response = await client.post(
        "/api/v1/financial/receipts/scan",
        json={"image_base64": _BLANK_PNG_BASE64, "media_type": "application/pdf"},
        headers=_auth(tourist["access_token"]),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_IMAGE_TYPE"


async def test_scanning_a_blank_image_honestly_reports_no_receipt_detected(
    client: AsyncClient,
) -> None:
    """Real Claude-vision call — the scanner's own system prompt forbids
    inventing plausible-looking values, so a blank image must come back
    honest (no_receipt_detected true, or at minimum amount 0), never a
    fabricated total."""
    tourist = await _register_and_login(client)
    response = await client.post(
        "/api/v1/financial/receipts/scan",
        json={"image_base64": _BLANK_PNG_BASE64, "media_type": "image/png"},
        headers=_auth(tourist["access_token"]),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["no_receipt_detected"] is True or data["amount"] == 0
    # Scanning alone must never create a financial record.
    expenses = await client.get(
        "/api/v1/financial/expenses", headers=_auth(tourist["access_token"])
    )
    assert expenses.json()["data"] == []


async def test_expense_create_list_scoped_to_owner_and_delete(client: AsyncClient) -> None:
    owner = await _register_and_login(client)
    stranger = await _register_and_login(client)
    headers = _auth(owner["access_token"])
    now = datetime.now(UTC).isoformat()

    created = await client.post(
        "/api/v1/financial/expenses",
        json={
            "category": "FOOD",
            "amount": 450,
            "currency": "INR",
            "description": "Lunch",
            "incurred_at": now,
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    expense = created.json()["data"]
    assert expense["amount"] == 450
    assert expense["source"] == "MANUAL"

    own_list = await client.get("/api/v1/financial/expenses", headers=headers)
    assert any(e["id"] == expense["id"] for e in own_list.json()["data"])

    stranger_list = await client.get(
        "/api/v1/financial/expenses", headers=_auth(stranger["access_token"])
    )
    assert all(e["id"] != expense["id"] for e in stranger_list.json()["data"])

    forbidden_delete = await client.delete(
        f"/api/v1/financial/expenses/{expense['id']}", headers=_auth(stranger["access_token"])
    )
    assert forbidden_delete.status_code == 403

    deleted = await client.delete(f"/api/v1/financial/expenses/{expense['id']}", headers=headers)
    assert deleted.status_code == 204

    after_delete = await client.get("/api/v1/financial/expenses", headers=headers)
    assert all(e["id"] != expense["id"] for e in after_delete.json()["data"])


async def test_trip_financial_summary_reflects_real_expenses_against_real_budget(
    client: AsyncClient,
) -> None:
    owner = await _register_and_login(client)
    headers = _auth(owner["access_token"])
    now = datetime.now(UTC).isoformat()

    trip = await client.post(
        "/api/v1/trips",
        json={"title": "Budget trip", "budget": 1000, "currency": "INR"},
        headers=headers,
    )
    assert trip.status_code == 201, trip.text
    trip_id = trip.json()["data"]["id"]

    baseline = await client.get(f"/api/v1/financial/trips/{trip_id}/summary", headers=headers)
    assert baseline.status_code == 200, baseline.text
    baseline_data = baseline.json()["data"]
    assert baseline_data["budget"] == 1000
    assert baseline_data["total_spent"] == 0
    assert baseline_data["is_over_budget"] is False

    await client.post(
        "/api/v1/financial/expenses",
        json={"trip_id": trip_id, "category": "FOOD", "amount": 400, "incurred_at": now},
        headers=headers,
    )
    await client.post(
        "/api/v1/financial/expenses",
        json={"trip_id": trip_id, "category": "TRANSPORT", "amount": 800, "incurred_at": now},
        headers=headers,
    )

    summary = await client.get(f"/api/v1/financial/trips/{trip_id}/summary", headers=headers)
    assert summary.status_code == 200, summary.text
    data = summary.json()["data"]
    assert data["total_spent"] == 1200
    assert data["remaining"] == -200
    assert data["is_over_budget"] is True
    assert data["by_category"]["FOOD"] == 400
    assert data["by_category"]["TRANSPORT"] == 800


async def test_non_member_cannot_log_expenses_or_view_summary_for_someone_elses_trip(
    client: AsyncClient,
) -> None:
    owner = await _register_and_login(client)
    stranger = await _register_and_login(client)
    now = datetime.now(UTC).isoformat()

    trip = await client.post(
        "/api/v1/trips", json={"title": "Private trip"}, headers=_auth(owner["access_token"])
    )
    trip_id = trip.json()["data"]["id"]

    forbidden_expense = await client.post(
        "/api/v1/financial/expenses",
        json={"trip_id": trip_id, "category": "OTHER", "amount": 100, "incurred_at": now},
        headers=_auth(stranger["access_token"]),
    )
    assert forbidden_expense.status_code == 403

    forbidden_summary = await client.get(
        f"/api/v1/financial/trips/{trip_id}/summary", headers=_auth(stranger["access_token"])
    )
    assert forbidden_summary.status_code == 403
