import type { AuthMode } from '@/lib/config/env';
import { normalizeHttpError, normalizeThrown } from './errors';
import { type ApiRequest, buildQueryString, type Transport } from './transport';

export interface FetchTransportOptions {
  baseUrl: string;
  authMode: AuthMode;
  timeoutMs: number;
  /** Bearer mode: returns the in-memory access token. */
  getAccessToken?: () => string | null;
  /** Bearer mode: attempts a silent refresh; resolves true if a retry is worthwhile. */
  refreshSession?: () => Promise<boolean>;
  /** Called when the backend reports the session is no longer valid. */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createFetchTransport(options: FetchTransportOptions): Transport {
  const doFetch = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function send<T>(request: ApiRequest, allowRefresh: boolean): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs ?? options.timeoutMs);
    const abortUpstream = () => controller.abort();
    request.signal?.addEventListener('abort', abortUpstream, { once: true });

    const headers = new Headers({ Accept: 'application/json' });
    if (request.body !== undefined) headers.set('Content-Type', 'application/json');
    if (request.idempotencyKey) headers.set('Idempotency-Key', request.idempotencyKey);
    if (options.authMode === 'bearer') {
      const token = options.getAccessToken?.();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    try {
      const response = await doFetch(`${options.baseUrl}${request.path}${buildQueryString(request.query)}`, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        credentials: options.authMode === 'cookie' ? 'include' : 'same-origin',
        signal: controller.signal,
      });
      const body = await readBody(response);

      if (response.ok) return body as T;

      if (response.status === 401) {
        if (allowRefresh && options.authMode === 'bearer' && options.refreshSession) {
          clearTimeout(timeout);
          if (await options.refreshSession()) return send<T>(request, false);
        }
        options.onUnauthorized?.();
      }
      throw normalizeHttpError(response.status, body, response.headers);
    } catch (error) {
      throw normalizeThrown(error, timedOut);
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abortUpstream);
    }
  }

  return {
    kind: 'fetch',
    request: <T>(request: ApiRequest) => send<T>(request, true),
  };
}
