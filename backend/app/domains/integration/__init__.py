"""Integration domain — providers, external_mappings, webhook_events.
Owns the `integration` DB schema.

The adapter *pattern* (provider-specific schemas never leak into domain
modules) is P0 architecture; most concrete external integrations (government,
transport, weather) are P1/P2. See docs/00-planning/01-project-master-model.md §Q.
"""
