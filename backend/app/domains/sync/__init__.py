"""Offline-sync idempotency domain — `sync` schema. Holds the one real,
atomic operation ledger this codebase uses to dedup both the offline queue
(`POST /api/v1/sync`) and the existing direct Idempotency-Key-header writes
(`POST /sos`, `POST /emergency/incidents`). See `models.py`/`service.py`.
"""
