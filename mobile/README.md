# TravIndi Mobile

Tourist app. Stack (confirmed):
[React Native + Expo (SDK 57) + TypeScript](../docs/00-planning/01-project-master-model.md#i-technology-stack),
using [Expo Router](https://docs.expo.dev/router/introduction/) for file-based navigation.
SQLite for offline local state lands in Phase 15 — see
[../docs/00-planning/07-implementation-roadmap.md](../docs/00-planning/07-implementation-roadmap.md).

Scaffolded in Phase 11 (Frontend foundations) via `npx create-expo-app`, against the real
Phase 8-10 backend (`../backend`) — mirrors `../web`'s screen coverage on native.

## What's real vs. stubbed (Phase 11)

Live against the backend:
- Register / login / logout (Keycloak-backed, via `../backend`'s auth proxy endpoints)
- Destination discovery (list + detail + attractions) — public
- Trip CRUD (create, list) for authenticated users
- Route protection via `Stack.Protected` — `/trips` and `/trips/new` are unreachable
  (redirect to `/`) while logged out, verified via direct URL navigation, not just UI clicks

Not yet built (later phases per the roadmap): AI trip planning, safe-route navigation,
SOS/trusted contacts, offline queue/sync, push notifications.

Known follow-ups:
- `src/lib/auth-context.tsx` does not yet retry with the stored refresh token on a 401.
- Verified only on Expo web (`expo start --web`) in this environment — no Android/iOS
  simulator available here. The API base URL in `.env.local` (`http://localhost:8010`)
  works for web and iOS simulator; an Android emulator needs `http://10.0.2.2:8010`, and
  a physical device needs the host machine's LAN IP — swap `EXPO_PUBLIC_API_BASE_URL`
  accordingly when testing those targets.
- No accessibility roles on the `Pressable`-based buttons yet (they read as generic
  elements to assistive tech / automation tooling, not as buttons).

## Running locally

Requires the backend running on `http://localhost:8010` (see `../backend/README.md`) and
its Keycloak/OPA/Postgres dependencies up (`../infra`).

```bash
cp .env.local.example .env.local   # EXPO_PUBLIC_API_BASE_URL
npm install
npm run web       # Expo web, for quick iteration without a simulator
npm run android   # requires an Android emulator/device
npm run ios       # requires macOS + an iOS simulator/device
```

## Structure

- `src/lib/api.ts` — typed client for the backend's `{data}`/`{error}` envelope (kept in
  sync by hand with `../web/src/lib/api.ts` — the two apps don't share a package)
- `src/lib/storage.ts` — token persistence: `expo-secure-store` on native, `localStorage`
  on web (SecureStore has no web implementation)
- `src/lib/auth-context.tsx` — `useAuth()`, mirrors the web app's context
- `src/app/_layout.tsx` — root `Stack` navigator; wraps auth-gated routes in
  `Stack.Protected`
- `src/app/` — routes: `index`, `login`, `register`, `destinations/index`,
  `destinations/[id]`, `trips/index`, `trips/new`
