"""OPA policy client — evaluates (principal, action, resource) against
infra/opa/policies/travindi/authz.rego. This is the deterministic decision
layer: identity (app/core/security.py) says who someone is; this says
whether they may do something. Never inverted, never bypassed by a model
(docs/00-planning/01-project-master-model.md §N "AI recommends, policy
decides").
"""

from typing import Literal

import httpx

from app.api.deps import Principal
from app.core.config import get_settings
from app.core.errors import AppError

ResourceType = Literal["sos", "incident", "verification", "review", "fraud_case", "self"]
Action = Literal["read", "write", "dispatch", "approve", "reject"]


async def is_allowed(
    *,
    principal: Principal,
    action: Action,
    resource_type: ResourceType,
    owner_id: str | None = None,
    assigned_to: str | None = None,
) -> bool:
    settings = get_settings()
    if not settings.opa_url:
        raise AppError(code="AUTHZ_NOT_CONFIGURED", message="OPA_URL is not configured.", status_code=500)

    payload = {
        "input": {
            "principal": {"user_id": principal.user_id, "role": principal.role},
            "action": action,
            "resource": {"type": resource_type, "owner_id": owner_id, "assigned_to": assigned_to},
        }
    }
    async with httpx.AsyncClient(timeout=2.0) as client:
        try:
            response = await client.post(f"{settings.opa_url}/v1/data/travindi/authz/allow", json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            # Fail closed: an unreachable policy engine must never be
            # treated as "allow" — that would silently disable
            # authorization instead of loudly failing it.
            raise AppError(
                code="AUTHZ_UNAVAILABLE",
                message="Policy engine is unreachable; request denied.",
                status_code=503,
                retryable=True,
            ) from exc

    return bool(response.json().get("result", False))


async def require_allowed(
    *,
    principal: Principal,
    action: Action,
    resource_type: ResourceType,
    owner_id: str | None = None,
    assigned_to: str | None = None,
) -> None:
    allowed = await is_allowed(
        principal=principal,
        action=action,
        resource_type=resource_type,
        owner_id=owner_id,
        assigned_to=assigned_to,
    )
    if not allowed:
        raise AppError(
            code="FORBIDDEN",
            message="You are not authorized to perform this action.",
            status_code=403,
        )
