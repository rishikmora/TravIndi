/**
 * TravIndi API client.
 *
 * Talks to the real FastAPI backend (default http://localhost:8010, prefix /api/v1).
 * Every backend response is enveloped:
 *   success -> { data: <payload>, meta: {...} }
 *   error   -> { error: { code, message, details, request_id, timestamp, retryable } }
 * This client unwraps `data` and throws a typed `ApiError` otherwise.
 */

export const API_BASE_URL: string =
  (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? "http://localhost:8010";

export const API_PREFIX = "/api/v1";

export const TOKEN_STORAGE_KEY = "travindi.auth";

export interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface ApiMeta {
  next_cursor?: string | null;
  has_more?: boolean;
  [key: string]: unknown;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id?: string;
  timestamp?: string;
  retryable?: boolean;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;
  requestId?: string;
  retryable: boolean;

  constructor(body: ApiErrorBody, status: number) {
    super(body.message || "Request failed");
    this.name = "ApiError";
    this.code = body.code || "unknown_error";
    this.status = status;
    this.details = body.details ?? {};
    this.requestId = body.request_id;
    this.retryable = Boolean(body.retryable);
  }

  /** Flattened field errors, when the backend sends per-field validation details. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.details)) {
      if (typeof value === "string") out[key] = value;
      else if (Array.isArray(value) && typeof value[0] === "string") out[key] = value[0] as string;
    }
    return out;
  }
}

export function readTokens(): StoredTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

export function writeTokens(tokens: StoredTokens | null) {
  if (typeof window === "undefined") return;
  if (tokens) window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Override / skip the stored bearer token. */
  token?: string | null;
  auth?: boolean;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const base = API_BASE_URL.replace(/\/$/, "");
  const suffix = path.startsWith("/api/") ? path : `${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
  const url = new URL(`${base}${suffix}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Raw request returning the full envelope (data + meta). */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { method = "GET", body, query, auth = true, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = options.token !== undefined ? options.token : auth ? readTokens()?.access_token : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError(
      {
        code: "network_error",
        message:
          "Could not reach the TravIndi API. Make sure the backend is running and reachable from this browser.",
        retryable: true,
        details: { base_url: API_BASE_URL, cause: String(cause) },
      },
      0,
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  const envelope = (parsed ?? {}) as { data?: T; meta?: ApiMeta; error?: ApiErrorBody };

  if (!response.ok || envelope.error) {
    throw new ApiError(
      envelope.error ?? {
        code: `http_${response.status}`,
        message: response.statusText || "Request failed",
        retryable: response.status >= 500,
      },
      response.status,
    );
  }

  return { data: (envelope.data as T) ?? (parsed as T), meta: envelope.meta ?? {} };
}

/** Convenience wrapper: returns the unwrapped payload. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiRequest<T>(path, options);
  return res.data;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    api<T>(path, { ...options, method: "DELETE" }),
  raw: apiRequest,
};
