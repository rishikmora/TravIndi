# TravIndi Mobile

Tourist app. Stack (confirmed):
[React Native + Expo + TypeScript](../docs/00-planning/01-project-master-model.md#i-technology-stack),
with SQLite for offline local state (Phase 15 — see
[../docs/00-planning/07-implementation-roadmap.md](../docs/00-planning/07-implementation-roadmap.md)).

**Not yet scaffolded.** Per the Phase 6 roadmap, this app is initialized in Phase 11
(Frontend foundations) via `npx create-expo-app`, once the backend's P0 endpoints
(Phase 8-10) exist for it to call. Scaffolding it earlier would mean building against
an API surface that doesn't exist yet.

MVP screens (Phase 11+, per the frozen P0 slice in
[../docs/00-planning/05-traceability-matrix-mvp.md](../docs/00-planning/05-traceability-matrix-mvp.md)):
auth, destination discovery, AI trip planning, safe-route navigation, one-tap SOS +
trusted contacts, offline queue/sync, notifications.
