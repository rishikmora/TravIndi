# Production image for the FastAPI backend. Postgres is external (Supabase —
# see docs/00-planning + memory on the Supabase migration), so this image
# only ever needs to talk out to Supabase/Keycloak/OPA/Anthropic, never run
# a database itself.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# build-essential: fallback for any dependency without a prebuilt manylinux
# wheel for this base image's platform (most of this project's C-extension
# deps — asyncpg, shapely, h3 — do ship one, but this keeps the build
# resilient rather than failing opaquely on a missing compiler).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

# CPU-only torch first: sentence-transformers pulls in torch, and the
# default PyPI wheel bundles a much larger CUDA build that's dead weight on
# a CPU-only deploy target — installing the CPU wheel first keeps the image
# a fraction of the size and avoids downloading gigabytes of unused CUDA
# libraries.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir .

EXPOSE 8000

# Shell form so ${PORT} expands — Render/Railway/Fly all inject their own
# $PORT and expect the container to bind to it rather than a fixed port.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
