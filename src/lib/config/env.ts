/**
 * Every environment-dependent value in the frontend is read here, and only
 * here. `NEXT_PUBLIC_*` variables are accessed statically so Next.js can
 * inline them at build time.
 *
 * See `.env.example` for documentation of each variable.
 */

export type DataMode = 'mock' | 'api';
export type AuthMode = 'cookie' | 'bearer';
export type AppEnvironment = 'development' | 'staging' | 'production';

const isProductionBuild = process.env.NODE_ENV === 'production';

function trimSlash(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

function resolveDataMode(requested: string | undefined): DataMode {
  if (requested === 'api') return 'api';
  if (requested === 'mock') {
    // Production builds may only run on the mock backend for explicit demos.
    if (isProductionBuild && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return 'api';
    return 'mock';
  }
  return isProductionBuild ? 'api' : 'mock';
}

const apiBaseUrl = trimSlash(process.env.NEXT_PUBLIC_API_BASE_URL);

export const env = {
  appName: 'TravIndi',
  environment: ((process.env.NEXT_PUBLIC_APP_ENV as AppEnvironment | undefined) ??
    (isProductionBuild ? 'production' : 'development')) as AppEnvironment,
  siteUrl: trimSlash(process.env.NEXT_PUBLIC_SITE_URL) || 'http://localhost:3000',

  /** `mock` uses the in-browser development backend; `api` talks to FastAPI. */
  dataMode: resolveDataMode(process.env.NEXT_PUBLIC_DATA_MODE),
  apiBaseUrl,
  authBaseUrl: trimSlash(process.env.NEXT_PUBLIC_AUTH_BASE_URL) || apiBaseUrl,
  wsUrl: trimSlash(process.env.NEXT_PUBLIC_WS_URL),
  authMode: (process.env.NEXT_PUBLIC_AUTH_MODE === 'bearer' ? 'bearer' : 'cookie') as AuthMode,
  requestTimeoutMs: Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? 15000) || 15000,

  mapStyleUrl: (process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? '').trim(),
  assetCdn: trimSlash(process.env.NEXT_PUBLIC_ASSET_CDN),
  enableServiceWorker:
    process.env.NEXT_PUBLIC_ENABLE_SERVICE_WORKER === 'true' ||
    (isProductionBuild && process.env.NEXT_PUBLIC_ENABLE_SERVICE_WORKER !== 'false'),

  isProductionBuild,
} as const;

export const isMockMode = env.dataMode === 'mock';

/** Throws early (in API mode) when required connection settings are missing. */
export function assertApiConfiguration() {
  if (env.dataMode !== 'api') return;
  if (!env.apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be set when NEXT_PUBLIC_DATA_MODE=api.');
  }
}
