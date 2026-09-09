"""Administration (Feature Blueprint P1 FR-40, "full admin suite" beyond the
P0-minimal slice). Real user/role management against the same Keycloak
realm `/auth/register` provisions into, a real (if partial — see
`app/domains/governance/audit.py`) audit-log trail, and a read-only view of
the `governance` schema's policy/retention registries.

Access is gated by a direct role check, same reasoning as `analytics.py`:
back-office actions with no per-row ownership semantics for OPA's resource
types to express — the confirmed role/permission matrix
(docs/00-planning/08-role-permission-matrix.md §3) names
`authority_platform_admin` as the *only* role with role/permission/
system-config access, which is exactly what this router is.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_pagination, get_rls_session
from app.core import keycloak_admin
from app.core.errors import AppError
from app.core.security import KNOWN_ROLES
from app.db.session import get_db_session
from app.domains.governance.audit import write_audit_log
from app.domains.governance.models import AuditLog, Policy, RetentionRule
from app.domains.identity.models import User, UserStatus
from app.schemas.common import DataResponse, ListResponse, Pagination

router = APIRouter(prefix="/admin", tags=["administration"])

_ADMIN_ROLES = {"authority_platform_admin", "service"}


def _require_platform_admin(principal: Principal) -> None:
    if principal.role not in _ADMIN_ROLES:
        raise AppError(
            code="FORBIDDEN", message="Only a platform admin account can access administration.", status_code=403
        )


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str | None
    phone: str | None
    account_type: str
    status: str
    created_at: datetime


class AdminUserDetailOut(AdminUserOut):
    realm_roles: list[str]


class RoleChangeIn(BaseModel):
    role: str


class StatusChangeIn(BaseModel):
    status: UserStatus


class AuditLogOut(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    actor_type: str
    action: str
    resource_type: str
    resource_id: uuid.UUID | None
    outcome: str
    occurred_at: datetime
    audit_metadata: dict


class PolicyOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    version: str
    active: bool


class RetentionRuleOut(BaseModel):
    id: uuid.UUID
    data_class: str
    retention_period_days: int | None
    description: str | None


def _account_type_for_role(role: str) -> str:
    if role.startswith("authority"):
        return "authority"
    return role


def _to_user_out(row: User) -> AdminUserOut:
    return AdminUserOut(
        id=row.id, email=row.email, phone=row.phone, account_type=row.account_type, status=row.status, created_at=row.created_at
    )


@router.get("/users", response_model=ListResponse[AdminUserOut])
async def list_users(
    q: str | None = None,
    account_type: str | None = None,
    pagination: Pagination = Depends(get_pagination),
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> ListResponse[AdminUserOut]:
    _require_platform_admin(principal)
    query = select(User).order_by(User.created_at.desc()).limit(pagination.limit)
    if account_type is not None:
        query = query.where(User.account_type == account_type)
    if q:
        like = f"%{q}%"
        query = query.where((User.email.ilike(like)) | (User.phone.ilike(like)))
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(data=[_to_user_out(r) for r in rows])


@router.get("/users/{user_id}", response_model=DataResponse[AdminUserDetailOut])
async def get_user(
    user_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[AdminUserDetailOut]:
    _require_platform_admin(principal)
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(code="USER_NOT_FOUND", message="No user with that id.", status_code=404)
    realm_roles = [r for r in await keycloak_admin.get_user_realm_roles(str(user.id)) if r in KNOWN_ROLES]
    return DataResponse(
        data=AdminUserDetailOut(**_to_user_out(user).model_dump(), realm_roles=realm_roles)
    )


@router.put("/users/{user_id}/role", response_model=DataResponse[AdminUserOut])
async def change_user_role(
    user_id: uuid.UUID,
    body: RoleChangeIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[AdminUserOut]:
    _require_platform_admin(principal)
    if body.role not in KNOWN_ROLES:
        raise AppError(code="UNKNOWN_ROLE", message=f"'{body.role}' is not a recognized application role.", status_code=422)
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(code="USER_NOT_FOUND", message="No user with that id.", status_code=404)

    await keycloak_admin.set_user_realm_role(str(user.id), body.role)
    previous_account_type = user.account_type
    user.account_type = _account_type_for_role(body.role)
    await write_audit_log(
        session,
        actor_user_id=principal.user_id,
        action="ADMIN_CHANGE_ROLE",
        resource_type="user",
        resource_id=user.id,
        metadata={"previous_account_type": previous_account_type, "new_role": body.role},
    )
    await session.commit()
    return DataResponse(data=_to_user_out(user))


@router.put("/users/{user_id}/status", response_model=DataResponse[AdminUserOut])
async def change_user_status(
    user_id: uuid.UUID,
    body: StatusChangeIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[AdminUserOut]:
    _require_platform_admin(principal)
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(code="USER_NOT_FOUND", message="No user with that id.", status_code=404)

    # Real enforcement: a disabled Keycloak account cannot obtain a new
    # access token, not just a cosmetic status flag on our own row.
    await keycloak_admin.set_user_enabled(str(user.id), enabled=body.status == UserStatus.ACTIVE)
    previous_status = user.status
    user.status = body.status
    await write_audit_log(
        session,
        actor_user_id=principal.user_id,
        action="ADMIN_CHANGE_STATUS",
        resource_type="user",
        resource_id=user.id,
        metadata={"previous_status": previous_status, "new_status": body.status},
    )
    await session.commit()
    return DataResponse(data=_to_user_out(user))


@router.get("/audit-log", response_model=ListResponse[AuditLogOut])
async def list_audit_log(
    resource_type: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    pagination: Pagination = Depends(get_pagination),
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[AuditLogOut]:
    _require_platform_admin(principal)
    query = select(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(pagination.limit)
    if resource_type is not None:
        query = query.where(AuditLog.resource_type == resource_type)
    if actor_user_id is not None:
        query = query.where(AuditLog.actor_user_id == actor_user_id)
    rows = (await session.execute(query)).scalars().all()
    return ListResponse(
        data=[
            AuditLogOut(
                id=r.id,
                actor_user_id=r.actor_user_id,
                actor_type=r.actor_type,
                action=r.action,
                resource_type=r.resource_type,
                resource_id=r.resource_id,
                outcome=r.outcome,
                occurred_at=r.occurred_at,
                audit_metadata=r.audit_metadata,
            )
            for r in rows
        ]
    )


@router.get("/policies", response_model=ListResponse[PolicyOut])
async def list_policies(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[PolicyOut]:
    _require_platform_admin(principal)
    rows = (await session.execute(select(Policy).order_by(Policy.name))).scalars().all()
    return ListResponse(
        data=[PolicyOut(id=r.id, name=r.name, description=r.description, version=r.version, active=r.active) for r in rows]
    )


@router.get("/retention-rules", response_model=ListResponse[RetentionRuleOut])
async def list_retention_rules(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[RetentionRuleOut]:
    _require_platform_admin(principal)
    rows = (await session.execute(select(RetentionRule).order_by(RetentionRule.data_class))).scalars().all()
    return ListResponse(
        data=[
            RetentionRuleOut(
                id=r.id, data_class=r.data_class, retention_period_days=r.retention_period_days, description=r.description
            )
            for r in rows
        ]
    )
