# PostGIS base image + pgvector extension, per the confirmed MVP data platform
# (docs/00-planning/01-project-master-model.md §K, §I).
#
# H3 spatial indexing is deliberately NOT installed as a Postgres extension here —
# H3 cell IDs are computed application-side (h3-py) and stored as plain indexed
# columns. This avoids depending on the less-maintained h3-pg extension for MVP;
# revisit only if a real need for DB-side H3 functions emerges.
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*

COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
COPY 02-app-role.sh /docker-entrypoint-initdb.d/02-app-role.sh
RUN chmod +x /docker-entrypoint-initdb.d/02-app-role.sh
