# Encodes the confirmed role-permission matrix
# (docs/00-planning/08-role-permission-matrix.md §3) as deterministic policy.
# "AI recommends, policy decides" (docs/00-planning/01-project-master-model.md
# §N) — this is the decision layer; it never sees or trusts model output,
# only (principal, action, resource) triples the backend has already
# authenticated/resolved.
#
# Input contract:
#   {"principal": {"user_id": "<uuid>", "role": "<role code>"},
#    "action": "read" | "write" | "dispatch" | "approve" | "reject",
#    "resource": {"type": "sos" | "incident" | "verification" | "review" |
#                 "fraud_case" | "self",
#                 "owner_id": "<uuid>", "assigned_to": "<uuid or null>"}}
# Output: {"allow": true|false}
#
# "dispatch" covers assign/escalate/resolve as one action class per the
# matrix's "RU + X(assign/escalate/dispatch/resolve)" grants — the backend
# is expected to additionally check the `assignment` ABAC attribute
# (docs/00-planning/08-role-permission-matrix.md §4) before actually letting
# an operator act on an incident/SOS not routed to them; OPA only encodes the
# role-level grant, not per-row assignment (that lives in the DB/service layer).
package travindi.authz

import rego.v1

default allow := false

service_roles := {"service", "authority_platform_admin"}

# Service accounts and the platform admin bypass everything — mirrors the
# RLS `_SERVICE_BYPASS` condition in
# backend/alembic/versions/*_row_level_security_*.py so the two layers agree.
allow if input.principal.role in service_roles

# --- SOS (emergency.sos_requests) ---
allow if {
	input.resource.type == "sos"
	input.action == "read"
	input.principal.user_id == input.resource.owner_id
}

allow if {
	input.resource.type == "sos"
	input.action == "write"
	input.principal.user_id == input.resource.owner_id
}

allow if {
	input.resource.type == "sos"
	input.action in {"read", "dispatch"}
	input.principal.role in {"authority_police", "authority_emergency_responder"}
}

allow if {
	input.resource.type == "sos"
	input.action == "read"
	input.principal.role == "authority_tourism_dept"
}

# --- Incident (safety.incidents) ---
allow if {
	input.resource.type == "incident"
	input.action in {"read", "write"}
	input.principal.user_id == input.resource.owner_id
}

allow if {
	input.resource.type == "incident"
	input.action == "read"
	input.principal.user_id == input.resource.assigned_to
}

allow if {
	input.resource.type == "incident"
	input.action in {"read", "dispatch"}
	input.principal.role in {"authority_police", "authority_emergency_responder"}
}

allow if {
	input.resource.type == "incident"
	input.action == "read"
	input.principal.role == "authority_tourism_dept"
}

# --- Business/Guide verification (trust.verifications, P1) ---
allow if {
	input.resource.type == "verification"
	input.action == "write"
	input.principal.user_id == input.resource.owner_id
}

allow if {
	input.resource.type == "verification"
	input.action in {"read", "approve", "reject"}
	input.principal.role == "authority_verifier"
}

# --- Reviews (trust.reviews, P1) ---
# Reads are open to any authenticated principal, same as destination/attraction
# content's "R" cell for every role in the confirmed matrix — reviews are
# social-proof content, not access-restricted like SOS/incidents. Only the
# author may write (create) their own review.
allow if {
	input.resource.type == "review"
	input.action == "read"
}

allow if {
	input.resource.type == "review"
	input.action == "write"
	input.principal.user_id == input.resource.owner_id
}

# --- Fraud cases (trust.fraud_cases, P1) ---
# Not in the frozen P0 matrix (docs/00-planning/08-role-permission-matrix.md
# §3 explicitly defers "reviews, fraud cases, ticketing, etc."), added here
# following the exact shape of the confirmed "Incident report" row: reporter
# RW (own), and the same escalation roles RU + dispatch(resolve).
allow if {
	input.resource.type == "fraud_case"
	input.action in {"read", "write"}
	input.principal.user_id == input.resource.owner_id
}

allow if {
	input.resource.type == "fraud_case"
	input.action in {"read", "dispatch"}
	input.principal.role in {"authority_police", "authority_tourism_dept", "authority_platform_admin"}
}

# --- Self-owned generic resources (profile, consents, notification prefs) ---
allow if {
	input.resource.type == "self"
	input.principal.user_id == input.resource.owner_id
}
