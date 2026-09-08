/**
 * Typed client for the TravIndi backend (Phase 8-10 P0 endpoints).
 * Unwraps the canonical `{data, meta}` / `{error}` envelopes
 * (docs/00-planning/01-project-master-model.md §L) so callers just get
 * plain typed values or a thrown ApiError.
 *
 * Mirrors web/src/lib/api.ts — kept in sync by hand since the two apps
 * don't share a package.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8010";

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, body: { code: string; message: string; details: Record<string, unknown> }) {
    super(body.message);
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (body?.error) {
      throw new ApiError(response.status, body.error);
    }
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface Destination {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  location: GeoPoint;
  timezone: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Attraction {
  id: string;
  destination_id: string;
  name: string;
  category: string | null;
  location: GeoPoint;
  capacity: number | null;
}

export interface Trip {
  id: string;
  user_id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Consent {
  id: string;
  purpose: string;
  status: string;
  version: string;
  granted_at: string | null;
  revoked_at: string | null;
}

export interface Me {
  id: string;
  email: string | null;
  phone: string | null;
  account_type: string;
  status: string;
  preferred_language: string | null;
  travel_preferences: Record<string, unknown>;
  accessibility_preferences: Record<string, unknown>;
  notification_preferences: Record<string, unknown>;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export type AccountType = "tourist" | "guide" | "business";

export const api = {
  register: (body: { email: string; password: string; account_type: AccountType }) =>
    request<{ data: Me }>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(body) }).then(
      (r) => r.data
    ),

  login: (body: { email: string; password: string }) =>
    request<{ data: TokenPair }>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(body) }).then(
      (r) => r.data
    ),

  refresh: (refresh_token: string) =>
    request<{ data: TokenPair }>("/api/v1/auth/token/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }).then((r) => r.data),

  me: (token: string) => request<{ data: Me }>("/api/v1/users/me", { token }).then((r) => r.data),

  listConsents: (token: string) =>
    request<{ data: Consent[] }>("/api/v1/users/me/consents", { token }).then((r) => r.data),

  grantConsent: (body: { purpose: string; version: string }, token: string) =>
    request<{ data: Consent }>("/api/v1/users/me/consents", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  revokeConsent: (id: string, token: string) =>
    request<void>(`/api/v1/users/me/consents/${id}`, { method: "DELETE", token }),

  listDestinations: () => request<{ data: Destination[] }>("/api/v1/destinations").then((r) => r.data),

  getDestination: (id: string) =>
    request<{ data: Destination }>(`/api/v1/destinations/${id}`).then((r) => r.data),

  listAttractions: (destinationId: string) =>
    request<{ data: Attraction[] }>(`/api/v1/destinations/${destinationId}/attractions`).then((r) => r.data),

  listTrips: (token: string) => request<{ data: Trip[] }>("/api/v1/trips", { token }).then((r) => r.data),

  getTrip: (id: string, token: string) =>
    request<{ data: Trip }>(`/api/v1/trips/${id}`, { token }).then((r) => r.data),

  createTrip: (
    body: { title?: string; start_date?: string; end_date?: string; budget?: number; currency?: string },
    token: string
  ) =>
    request<{ data: Trip }>("/api/v1/trips", { method: "POST", body: JSON.stringify(body), token }).then(
      (r) => r.data
    ),

  updateTrip: (id: string, body: Partial<{ title: string; status: string }>, token: string) =>
    request<{ data: Trip }>(`/api/v1/trips/${id}`, { method: "PATCH", body: JSON.stringify(body), token }).then(
      (r) => r.data
    ),

  cancelTrip: (id: string, token: string) =>
    request<void>(`/api/v1/trips/${id}`, { method: "DELETE", token }),
};
