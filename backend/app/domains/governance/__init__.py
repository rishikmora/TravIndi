"""Governance domain — policies, audit_logs, retention_rules.
Owns the `governance` DB schema.

P0 (Privacy & Security are P0 at every deployment stage per the NFR priority
matrix). Every critical-workflow write elsewhere in the system emits an audit
event here. Implemented alongside Phase 9 (auth/OPA) and Phase 17 (observability).
"""
