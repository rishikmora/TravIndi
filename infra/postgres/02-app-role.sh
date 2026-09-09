#!/bin/bash
# Creates a dedicated, non-superuser application role.
#
# Why this exists: the postgres official image's bootstrap user
# ($POSTGRES_USER) is a SUPERUSER, and superusers unconditionally bypass Row
# Level Security regardless of FORCE ROW LEVEL SECURITY (that flag only
# affects the *table owner* bypass, not the superuser bypass). If the
# backend connected as $POSTGRES_USER, the RLS policies added in
# backend/alembic/versions/*_row_level_security_*.py would silently do
# nothing. The backend's runtime DATABASE_URL must use this role;
# migrations keep using $POSTGRES_USER (DDL owner) via
# MIGRATIONS_DATABASE_URL — see backend/.env.example.
set -euo pipefail

SCHEMAS="identity tourism travel safety emergency crowd business booking payment trust knowledge analytics integration governance gamification lost_found financial group_travel social"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'travindi_app') THEN
        CREATE ROLE travindi_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
      END IF;
    END
    \$\$;
EOSQL

for schema in $SCHEMAS; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
      GRANT USAGE ON SCHEMA ${schema} TO travindi_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO travindi_app;
      ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA ${schema}
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO travindi_app;
EOSQL
done
