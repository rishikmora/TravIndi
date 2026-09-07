# TravIndi Web

Three surfaces on one Next.js codebase (confirmed stack — see
[../docs/00-planning/01-project-master-model.md](../docs/00-planning/01-project-master-model.md)):

1. **Public PWA** — destination discovery, account, itinerary/booking flows
2. **Authority command center** — live GIS map, SOS/incident monitoring, dispatch
   (role-scoped per [../docs/00-planning/08-role-permission-matrix.md](../docs/00-planning/08-role-permission-matrix.md))
3. **Business / guide portal** — KYC upload, availability, credential status (P1)

**Not yet scaffolded.** Per the Phase 6 roadmap, this is initialized in Phase 11
(Frontend foundations) via `npx create-next-app`, once the backend's P0 endpoints
(Phase 8-10) exist for it to call.

The authority command center is the P0 surface (`GET /api/v1/authority/dashboard`,
`WS /ws/authority/{id}` — see
[../docs/00-planning/05-traceability-matrix-mvp.md](../docs/00-planning/05-traceability-matrix-mvp.md));
the business/guide portal is P1 and comes later.
