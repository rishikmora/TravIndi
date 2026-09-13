export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;
export type QueryParams = Record<string, QueryValue>;

export interface ApiRequest {
  method: HttpMethod;
  /** Path from `endpoints.ts`, e.g. "/v1/trips/abc". Never a full URL. */
  path: string;
  query?: QueryParams;
  /** Already in wire (snake_case) shape. */
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Sent as `Idempotency-Key` so retries of unsafe requests are safe. */
  idempotencyKey?: string;
}

/**
 * How requests reach a backend. `fetch` talks to FastAPI; `mock` serves the
 * same documented contract from an in-browser development backend. Repositories
 * are written once against this interface.
 */
export interface Transport {
  readonly kind: 'fetch' | 'mock';
  request<T>(request: ApiRequest): Promise<T>;
}

export function buildQueryString(query: QueryParams | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
    else params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
