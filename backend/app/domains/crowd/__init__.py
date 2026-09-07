"""Crowd domain — crowd_cells, observations, crowd_predictions, crowd_events,
plus IoT device/measurement tables (folded in here for MVP, not a separate
schema — docs/00-planning/09-database-schema-plan.md §5). Owns the `crowd`
DB schema.

P0 minimal (crowd view feeding safe-route scoring), Phase 14. Density
forecasting (XGBoost/LightGBM) and IoT/MQTT ingestion are P1, Phase 3 pilot scope.
"""
