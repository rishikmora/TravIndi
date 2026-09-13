import type { ApiRequest, HttpMethod } from '@/lib/api/transport';
import type { UserDto } from '@/types/api';
import type { MockResponse } from './http';
import type { RealtimeHub } from './realtime';
import type { MockStore } from './store';

export interface HandlerContext {
  request: ApiRequest;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  store: MockStore;
  hub: RealtimeHub;
  /** Current mock session user, or null when signed out. */
  user: UserDto | null;
  /** Returns the session user or fails with 401. */
  requireUser: () => UserDto;
  requireRole: (role: UserDto['roles'][number]) => UserDto;
}

export type Handler = (ctx: HandlerContext) => MockResponse | Promise<MockResponse>;

export interface RouteDefinition {
  method: HttpMethod;
  pattern: string;
  handler: Handler;
}

interface CompiledRoute extends RouteDefinition {
  regex: RegExp;
  keys: string[];
}

export function route(method: HttpMethod, pattern: string, handler: Handler): RouteDefinition {
  return { method, pattern, handler };
}

export function compileRoutes(definitions: RouteDefinition[]) {
  const compiled: CompiledRoute[] = definitions.map((definition) => {
    const keys: string[] = [];
    const source = definition.pattern
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          keys.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
      })
      .join('/');
    return { ...definition, keys, regex: new RegExp(`^${source}$`) };
  });

  return function match(method: HttpMethod, path: string) {
    for (const candidate of compiled) {
      if (candidate.method !== method) continue;
      const result = candidate.regex.exec(path);
      if (!result) continue;
      const params: Record<string, string> = {};
      candidate.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(result[i + 1] ?? '');
      });
      return { route: candidate, params };
    }
    return null;
  };
}

export function flattenQuery(query: ApiRequest['query']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    out[key] = Array.isArray(value) ? value.join(',') : String(value);
  }
  return out;
}
