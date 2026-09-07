# Role & Permission Matrix — CONFIRMED

Status: **DESIGNED — confirmed by user on 2026-09-07** (resolves
[Conflict Register §7](02-conflict-register.md) / [Assumption Register D1, D2](03-assumption-register.md)).

No source document states a role-permission matrix. This was built by cross-referencing
every scattered clue across all 7 documents, then filling the actual gaps with explicit
engineering judgment calls — every row below is tagged **[A]** (directly stated in a
source), **[B]** (strongly implied), or **[C]** (proposed, no source basis). The three
forks that genuinely couldn't be resolved from the documents alone were put to the user
directly; their decisions are recorded in **§5** and are now binding for Phase 9.

---

## 1. Identity model

**Account types (from Functional Requirements, Domain 01 — [A]):** `tourist`,
`guide`, `business`, `authority`. These are the only four the documents actually name
as account types — kept as-is, nothing added or removed at this level.

**Non-account actor — Trusted Contact [A, partially; access model CONFIRMED by user]:**
the API Design document states "trusted contact → limited status/location" as a real
access tier, but never says how access is granted. **Confirmed design:** trusted
contact does *not* get a platform account. Instead:

- The tourist registers a contact (phone/email + relationship label) on their profile.
- When an SOS opens, the system issues a **one-time, short-lived, single-purpose
  access token** delivered to that exact contact channel (SMS/email) — bound to the
  specific SOS incident, not reusable across incidents.
- The token grants **minimum-necessary information only**: SOS status and
  approximate/current location as permitted by the tourist's consent settings — never
  full profile, trip history, or other tourists' data.
- **Step-up OTP** is required before the token can reveal anything higher-risk than
  basic status (e.g., precise live location) — a second verification factor sent to
  the same registered contact channel.
- The token **expires automatically** on SOS resolution or a short TTL, whichever
  comes first (`[C]` proposed TTL: 6 hours — not sourced, needs no further
  confirmation unless you want a different number; revisit at Phase 14).
- The token is **single-use / replay-protected** (each access event invalidates or
  rotates it) and **revocable** by the tourist or an authority operator at any time.
- **Every access through this token is audited** — who, when, what fields were
  viewed — written to `governance.audit_logs`.

This requires one new table (e.g. `identity.trusted_contact_access_tokens`: token
hash, contact channel, sos_id, issued_at, expires_at, revoked_at, used_at, otp_verified_at)
and one new endpoint family (e.g. `POST /api/v1/sos/{id}/trusted-contact/verify`
accepting the token + OTP) — added to the Phase 14 (Safety/SOS) scope in
[07-implementation-roadmap.md](07-implementation-roadmap.md).

**Authority sub-roles [B; account-type-vs-roles decision CONFIRMED by user]:** System
Design's adapter diagram and the Feature Blueprint's Government Intelligence domain
name distinct dashboards — Police, Tourism Authority, Municipality,
Business-verification, Emergency-services — with no document ever stating whether
these are separate account types or one `authority` account type with internal roles.
**Confirmed:** modeled as **Keycloak realm roles under the single `authority` account
type** (not separate account types) — this preserves the sourced 4-type structure
exactly, and RBAC roles are cheaper to add/remove/re-scope later than account types
baked into the schema.

Proposed authority realm roles:

| Role code | Maps to | Primary function |
|---|---|---|
| `authority_police` | Police dashboard | Incident/SOS response, dispatch, evidence |
| `authority_emergency_responder` | Emergency-services dashboard (ambulance/hospital/fire) | Incident/SOS response, dispatch, arrival/resolution updates |
| `authority_tourism_dept` | Tourism authority dashboard | Destination/attraction management, tourism analytics, crowd/capacity planning |
| `authority_municipality` | Municipality dashboard | Infrastructure reporting, local incident visibility (non-emergency) — **scope genuinely underspecified in every source document**, see [Assumption D3](03-assumption-register.md) |
| `authority_verifier` | Business verification dashboard | Reviews Business/Guide KYC & credential submissions |
| `authority_platform_admin` | (implied by FR-40 Administration: "role management," "permission management," "system configuration") | User/role/permission management, system configuration — back-office, not field-operations |

**Service / device identities [A]:** explicitly required to be *separate* from all of
the above ("should not be collapsed into one credential model" — System Design, API
Design). These get scoped API keys or mTLS client credentials, never a human role:
`svc_ai_gateway`, `svc_webhook_receiver`, `svc_iot_gateway`, `svc_background_worker`.

## 2. ABAC attributes (used alongside RBAC roles, enforced by OPA)

| Attribute | Meaning | Source |
|---|---|---|
| `ownership` | Resource's `user_id`/`business_id` matches the requester | System Design RLS line: "Tourists: own data \| Business: own inventory" |
| `geography` | Requester's assigned zone/H3 cells contains the resource's location | System Design RLS line: "Authorities: assigned geography/function" |
| `assignment` | Resource (SOS/incident) is explicitly assigned to this operator | API Design "Emergency authorization model": "police/ambulance/authority → scoped operational access according to role, geography **and incident assignment**" |
| `consent_scope` | Tourist's consent record permits this specific access purpose | Database Design `identity.user_consents`; NFR privacy minimization |
| `verification_status` | Business/Guide's KYC status gates what they can publish | Business Verification & Trust domain (FR-13) |
| `sos_active` | An SOS from this tourist is currently open | Gates trusted-contact access — access should not persist after resolution |

## 3. Permission matrix — MVP (P0) resources only

`R`=read, `W`=create, `U`=update, `D`=delete/cancel, `X`=special operational action.
Blank = no access. This covers only the resources in the frozen P0 slice
([05-traceability-matrix-mvp.md](05-traceability-matrix-mvp.md)); P1+ resources
(bookings, reviews, fraud cases, ticketing, etc.) are deferred and not modeled here yet.

| Resource | Tourist | Guide | Business | `authority_police` | `authority_emergency_responder` | `authority_tourism_dept` | `authority_verifier` | `authority_platform_admin` | Trusted Contact |
|---|---|---|---|---|---|---|---|---|---|
| Own user profile / consent | RWU (own) | RWU (own) | RWU (own) | — | — | — | — | R (audit only) | — |
| Other users' profiles | — | — | — | R (assigned case only) | R (assigned case only) | — | R (verification review only) | RWU (admin) | — |
| Trip / Itinerary | RWU (own) | — | — | — | — | — | — | — | — |
| Destination / Attraction content | R | R | R | R | R | RWU | R | RWU | R |
| Route computation | R (own request) | R | R | R | R | R | — | R | — |
| **SOS request** | RWU/D (own, create+cancel) | — | — | RU + `X`(assign/escalate) | RU + `X`(dispatch/resolve) | R (analytics only) | — | R (audit) | R via one-time token only (status always; precise location requires OTP step-up) — see §1 |
| Incident report | RW (own reports) | RW (own reports) | RW (own reports) | RU + `X`(assign/escalate/resolve) | RU + `X`(assign/resolve) | R (analytics) | — | R (audit) | — |
| Emergency resource / dispatch | — | — | — | RU + `X`(dispatch) | RU + `X`(dispatch) | — | — | R | — |
| Crowd/heatmap data (aggregate, H3) | R | R | R | R | R | R | — | R | — |
| Business profile / services | — | — | RWU (own) | — | — | R | R (verification) | RWU | — |
| Business KYC / credential submission | — | — | W (own, submit) | — | — | — | RU + `X`(approve/reject) | R | — |
| Guide profile / credentials | — | RWU (own) | — | — | — | R | RU + `X`(approve/reject) | RWU | — |
| Notification preferences | RWU (own) | RWU (own) | RWU (own) | RWU (own) | RWU (own) | RWU (own) | RWU (own) | RWU (own) | — |
| Authority dashboard (live map/SOS/incidents) | — | — | — | R (assigned geography) | R (assigned geography) | R (own scope) | — | R (all) | — |
| Audit log | — | — | — | — | — | — | — | R | — |
| Role / permission / system config | — | — | — | — | — | — | — | RWU | — |

## 4. Policy notes for OPA implementation

- Every `X` action (assign/escalate/resolve/dispatch/approve/reject) additionally
  requires the `assignment` ABAC attribute where applicable — an authority operator
  cannot act on an incident/SOS that hasn't been routed to them, even if their role
  would otherwise permit the action class.
- Trusted-contact access is time- and state-scoped: granted only while `sos_active`
  is true for that specific tourist, revoked automatically on resolution — this must
  be enforced at the policy layer, not just at issue-time of the access link.
- `authority_tourism_dept` and `authority_municipality` get read-only operational
  visibility (no dispatch/assign rights) — those actions are reserved for
  `authority_police` / `authority_emergency_responder`, consistent with the documents'
  own framing of Tourism Authority/Municipality as planning/analytics-facing rather
  than emergency-response-facing.
- `authority_platform_admin` is intentionally the *only* role with role/permission/
  system-config write access — this is a back-office function, kept separate from
  field-operations roles so that no operational role can silently grant itself more
  access.

---

## 5. Decisions confirmed by user (2026-09-07)

| Fork | Decision |
|---|---|
| Authority sub-personas | Roles/scopes under one `authority` account type — not separate account types |
| Trusted Contact access | No platform account; one-time short-lived token per SOS incident, minimum-necessary data, OTP step-up for higher-risk fields (precise location), auto-expiry on resolution or short TTL, single-use/replay-protected, revocable, fully audited |
| Business/Guide verification ownership | Dedicated `authority_verifier` role, kept separate from `authority_tourism_dept` |

These are now binding for Phase 9 (auth/authz implementation) and Phase 14
(Safety/SOS, for the trusted-contact token flow). The only still-open, non-blocking
detail is the exact token TTL (`[C]` 6 hours proposed) — revisit if you want a
different number, otherwise it proceeds as-is.
