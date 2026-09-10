"""Identity — FR-01. Phase 10: real implementations for register, /users/me,
and consents CRUD, using the ORM models from Phase 7 (app/domains/identity/models.py)
rather than raw SQL, consistent with the rest of the codebase (tourism/travel
routers). `/auth/login` and `/auth/token/refresh` were already real as of
Phase 9 (thin Keycloak proxies). `/auth/otp/verify` stays 501 — the source
API contract never actually defines how an OTP challenge is created (no
"request OTP" endpoint exists anywhere in the 7 spec documents either), and
building a full passwordless flow that still produces a valid
Keycloak-issued token is a distinct subsystem, not something to improvise
here (flagged as a genuine gap, not faked).
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_current_principal, get_rls_session
from app.core.errors import AppError, NotImplementedYet
from app.core.keycloak_admin import create_user, set_user_password
from app.core.keycloak_client import login_with_password, refresh_access_token
from app.db.session import get_db_session
from app.domains.identity.models import TrustedContact, User, UserConsent, UserProfile
from app.domains.identity.schemas import (
    AccessibilityPreferencesIn,
    ChangePasswordIn,
    ConsentIn,
    ConsentOut,
    LanguagePreferenceIn,
    LoginIn,
    MeOut,
    OtpVerifyIn,
    RegisterIn,
    TokenOut,
    TokenRefreshIn,
    TravelPreferencesIn,
    TravelPreferencesOut,
    TrustedContactIn,
    TrustedContactOut,
)
from app.schemas.common import DataResponse, ListResponse

auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])


def _to_consent_out(row: UserConsent) -> ConsentOut:
    return ConsentOut(
        id=row.id, purpose=row.purpose, status=row.status, version=row.version,
        granted_at=row.granted_at, revoked_at=row.revoked_at,
    )


@auth_router.post("/register", response_model=DataResponse[MeOut], status_code=201)
async def register(body: RegisterIn, session: AsyncSession = Depends(get_db_session)) -> DataResponse[MeOut]:
    keycloak_user_id = await create_user(
        email=body.email, phone=body.phone, password=body.password, realm_role=body.account_type.value
    )

    # No principal exists yet (the user isn't logged in) — write as the
    # service role, same pattern as app/db/seed.py, then use the ORM
    # normally so Python-side column defaults (JSONB '{}', timestamps)
    # apply correctly, unlike a hand-written INSERT.
    await session.execute(text("SELECT set_config('app.user_role', 'service', true)"))
    user = User(
        id=uuid.UUID(keycloak_user_id),
        email=body.email,
        phone=body.phone,
        account_type=body.account_type.value,
    )
    session.add(user)
    session.add(UserProfile(user_id=user.id))
    await session.commit()

    return DataResponse(
        data=MeOut(
            id=user.id,
            email=user.email,
            phone=user.phone,
            account_type=user.account_type,
            status=user.status.value,
            created_at=user.created_at,
        )
    )


@auth_router.post("/login", response_model=DataResponse[TokenOut])
async def login(body: LoginIn) -> DataResponse[TokenOut]:
    username = body.email or body.phone
    if not username:
        raise AppError(code="MISSING_IDENTIFIER", message="email or phone is required.")
    token = await login_with_password(username=str(username), password=body.password)
    return DataResponse(
        data=TokenOut(access_token=token["access_token"], refresh_token=token["refresh_token"], expires_in=token["expires_in"])
    )


@auth_router.post("/otp/verify", response_model=DataResponse[TokenOut])
async def verify_otp(_body: OtpVerifyIn) -> DataResponse[TokenOut]:
    raise NotImplementedYet(
        phase="Not yet scheduled — the source API contract never defines how an "
        "OTP challenge is created (no 'request OTP' endpoint exists in any of the "
        "7 spec documents); needs its own design pass before implementation"
    )


@auth_router.post("/token/refresh", response_model=DataResponse[TokenOut])
async def refresh_token(body: TokenRefreshIn) -> DataResponse[TokenOut]:
    token = await refresh_access_token(refresh_token=body.refresh_token)
    return DataResponse(
        data=TokenOut(access_token=token["access_token"], refresh_token=token["refresh_token"], expires_in=token["expires_in"])
    )


@users_router.get("/me", response_model=DataResponse[MeOut])
async def get_me(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[MeOut]:
    user = await session.get(User, uuid.UUID(principal.user_id))
    if user is None:
        raise AppError(code="USER_NOT_FOUND", message="No local profile for this account.", status_code=404)
    profile = await session.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile_row = profile.scalar_one_or_none()

    return DataResponse(
        data=MeOut(
            id=user.id,
            email=user.email,
            phone=user.phone,
            account_type=user.account_type,
            status=user.status.value,
            created_at=user.created_at,
            preferred_language=profile_row.preferred_language if profile_row else None,
            travel_preferences=profile_row.travel_preferences if profile_row else {},
            accessibility_preferences=profile_row.accessibility_preferences if profile_row else {},
            notification_preferences=profile_row.notification_preferences if profile_row else {},
        )
    )


@users_router.put("/me/language", response_model=DataResponse[LanguagePreferenceIn])
async def set_language_preference(
    body: LanguagePreferenceIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[LanguagePreferenceIn]:
    result = await session.execute(
        update(UserProfile)
        .where(UserProfile.user_id == uuid.UUID(principal.user_id))
        .values(preferred_language=body.preferred_language)
    )
    if result.rowcount == 0:
        raise AppError(code="PROFILE_NOT_FOUND", message="No profile for this account.", status_code=404)
    await session.commit()
    return DataResponse(data=body)


@users_router.put("/me/password", status_code=204)
async def change_password(
    body: ChangePasswordIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> None:
    """Requires the caller to prove they know the *current* password (a
    real login attempt against Keycloak) before an admin-level reset is
    allowed to take effect — otherwise a stolen still-valid access token
    alone would be enough to lock the real owner out."""
    user = await session.get(User, uuid.UUID(principal.user_id))
    if user is None or not (user.email or user.phone):
        raise AppError(code="USER_NOT_FOUND", message="No local profile for this account.", status_code=404)
    try:
        await login_with_password(username=str(user.email or user.phone), password=body.current_password)
    except AppError:
        raise AppError(code="INVALID_PASSWORD", message="Current password is incorrect.", status_code=401) from None
    await set_user_password(str(user.id), body.new_password)


@users_router.get("/me/accessibility-preferences", response_model=DataResponse[AccessibilityPreferencesIn])
async def get_accessibility_preferences(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[AccessibilityPreferencesIn]:
    result = await session.execute(select(UserProfile).where(UserProfile.user_id == uuid.UUID(principal.user_id)))
    profile = result.scalar_one_or_none()
    stored = profile.accessibility_preferences if profile else {}
    return DataResponse(data=AccessibilityPreferencesIn(**stored))


@users_router.put("/me/accessibility-preferences", response_model=DataResponse[AccessibilityPreferencesIn])
async def set_accessibility_preferences(
    body: AccessibilityPreferencesIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[AccessibilityPreferencesIn]:
    result = await session.execute(
        update(UserProfile)
        .where(UserProfile.user_id == uuid.UUID(principal.user_id))
        .values(accessibility_preferences=body.model_dump())
    )
    if result.rowcount == 0:
        raise AppError(code="PROFILE_NOT_FOUND", message="No profile for this account.", status_code=404)
    await session.commit()
    return DataResponse(data=body)


@users_router.get("/me/travel-preferences", response_model=DataResponse[TravelPreferencesOut])
async def get_travel_preferences(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[TravelPreferencesOut]:
    result = await session.execute(select(UserProfile).where(UserProfile.user_id == uuid.UUID(principal.user_id)))
    profile = result.scalar_one_or_none()
    stored = profile.travel_preferences if profile else {}
    return DataResponse(data=TravelPreferencesOut(**stored))


@users_router.put("/me/travel-preferences", response_model=DataResponse[TravelPreferencesOut])
async def set_travel_preferences(
    body: TravelPreferencesIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_rls_session),
) -> DataResponse[TravelPreferencesOut]:
    result = await session.execute(
        update(UserProfile)
        .where(UserProfile.user_id == uuid.UUID(principal.user_id))
        .values(travel_preferences=body.model_dump())
    )
    if result.rowcount == 0:
        raise AppError(code="PROFILE_NOT_FOUND", message="No profile for this account.", status_code=404)
    await session.commit()
    return DataResponse(data=TravelPreferencesOut(**body.model_dump()))


@users_router.get("/me/consents", response_model=ListResponse[ConsentOut])
async def list_consents(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[ConsentOut]:
    result = await session.execute(
        select(UserConsent).where(UserConsent.user_id == uuid.UUID(principal.user_id)).order_by(UserConsent.purpose)
    )
    return ListResponse(data=[_to_consent_out(row) for row in result.scalars().all()])


@users_router.post("/me/consents", response_model=DataResponse[ConsentOut], status_code=201)
async def grant_consent(
    body: ConsentIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[ConsentOut]:
    consent = UserConsent(
        user_id=uuid.UUID(principal.user_id),
        purpose=body.purpose,
        status="GRANTED",
        version=body.version,
        granted_at=datetime.now(UTC),
    )
    session.add(consent)
    await session.commit()
    return DataResponse(data=_to_consent_out(consent))


@users_router.delete("/me/consents/{consent_id}", status_code=204)
async def revoke_consent(
    consent_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """A consent is revoked (status flips, revoked_at is stamped), never
    hard-deleted — "Consent is a first-class record, not a boolean hidden
    in the profile" (Database Design; docs/00-planning/01-project-master-model.md §K)."""
    result = await session.execute(
        update(UserConsent)
        .where(UserConsent.id == consent_id, UserConsent.user_id == uuid.UUID(principal.user_id))
        .values(status="REVOKED", revoked_at=datetime.now(UTC))
    )
    if result.rowcount == 0:
        raise AppError(code="CONSENT_NOT_FOUND", message="No such consent for this account.", status_code=404)
    await session.commit()


def _to_trusted_contact_out(row: TrustedContact) -> TrustedContactOut:
    return TrustedContactOut(
        id=row.id, name=row.name, relationship_label=row.relationship_label, phone=row.phone, email=row.email
    )


@users_router.get("/me/trusted-contacts", response_model=ListResponse[TrustedContactOut])
async def list_trusted_contacts(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> ListResponse[TrustedContactOut]:
    result = await session.execute(
        select(TrustedContact).where(TrustedContact.user_id == uuid.UUID(principal.user_id)).order_by(TrustedContact.created_at)
    )
    return ListResponse(data=[_to_trusted_contact_out(row) for row in result.scalars().all()])


@users_router.post("/me/trusted-contacts", response_model=DataResponse[TrustedContactOut], status_code=201)
async def add_trusted_contact(
    body: TrustedContactIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> DataResponse[TrustedContactOut]:
    """Registered ahead of any emergency — used by POST /sos (Phase 14) to
    issue each contact a one-time, SOS-scoped access token
    (docs/00-planning/08-role-permission-matrix.md §1). A trusted contact
    never gets a platform account of their own."""
    contact = TrustedContact(
        user_id=uuid.UUID(principal.user_id),
        name=body.name,
        relationship_label=body.relationship_label,
        phone=body.phone,
        email=body.email,
    )
    session.add(contact)
    await session.commit()
    return DataResponse(data=_to_trusted_contact_out(contact))


@users_router.delete("/me/trusted-contacts/{contact_id}", status_code=204)
async def remove_trusted_contact(
    contact_id: uuid.UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    result = await session.execute(
        select(TrustedContact).where(
            TrustedContact.id == contact_id, TrustedContact.user_id == uuid.UUID(principal.user_id)
        )
    )
    contact = result.scalar_one_or_none()
    if contact is None:
        raise AppError(code="TRUSTED_CONTACT_NOT_FOUND", message="No such trusted contact.", status_code=404)
    await session.delete(contact)
    await session.commit()
