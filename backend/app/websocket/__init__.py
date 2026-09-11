"""Realtime WebSocket gateway — the first real implementation of what this
module used to only sketch (`/ws/sos/{id}`, `/ws/destination/{id}`,
`/ws/authority/{id}`, one URL per channel, Phase-14 placeholder). The real
design is simpler: one route, `WS /api/v1/realtime`, channel-scoped via
subscribe/unsubscribe frames rather than one URL per channel type.

In-process only, no Redis pub/sub: this deployment runs a single uvicorn
process (no `--workers`), and prod's own compose file doesn't run Redis at
all — building Redis-backed fanout now would be new infra (a prod Redis
service, a lifespan hook that doesn't exist yet, a new subscriber-crash
failure mode) solving a horizontal-scaling problem this deployment
doesn't have. `manager.publish()` is the one seam every event goes
through, so a later swap to Redis pub/sub (if this ever runs on >1
process) is contained to that function's body, not scattered across
every caller.

Every mutation still happens over REST first (location-sharing, group
travel, chat) — this gateway only ever broadcasts what already happened,
never originates a durable state change itself. The one exception is
ephemeral, never-persisted typing indicators.
"""
