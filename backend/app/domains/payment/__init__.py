"""Payment domain — payments, refunds, payment_events, webhooks.
Owns the `payment` DB schema.

P1. Not part of the frozen P0 MVP slice. Payment gateway vendor is deliberately
unpicked (docs/00-planning/03-assumption-register.md C7) — kept behind a
provider-abstraction adapter when built.
"""
