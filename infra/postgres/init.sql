-- Bootstrap extensions and the 14 confirmed schemas.
-- See docs/00-planning/09-database-schema-plan.md for the full rationale.
-- Table-level DDL is authored in Phase 7 (backend/alembic/versions) — this file only
-- establishes the schema boundaries and required extensions so migrations have
-- somewhere to run.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS tourism;
CREATE SCHEMA IF NOT EXISTS travel;
CREATE SCHEMA IF NOT EXISTS safety;
CREATE SCHEMA IF NOT EXISTS emergency;
CREATE SCHEMA IF NOT EXISTS crowd;       -- includes IoT device/measurement tables for MVP
CREATE SCHEMA IF NOT EXISTS business;
CREATE SCHEMA IF NOT EXISTS booking;
CREATE SCHEMA IF NOT EXISTS payment;
CREATE SCHEMA IF NOT EXISTS trust;
CREATE SCHEMA IF NOT EXISTS knowledge;   -- AI / RAG tables
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS gamification; -- P2 feature-blueprint pass, added 2026-09-08
CREATE SCHEMA IF NOT EXISTS lost_found; -- P2 feature-blueprint pass, added 2026-09-08
CREATE SCHEMA IF NOT EXISTS financial; -- P2 feature-blueprint pass, added 2026-09-08
CREATE SCHEMA IF NOT EXISTS group_travel; -- P2 feature-blueprint pass, added 2026-09-08
CREATE SCHEMA IF NOT EXISTS social; -- P2 feature-blueprint pass, added 2026-09-08
CREATE SCHEMA IF NOT EXISTS location_sharing; -- Live Location Sharing feature, added 2026-09-11
