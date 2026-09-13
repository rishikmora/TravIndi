import type { ApiErrorBodyDto, MoneyDto } from '@/types/api';

export interface MockResponse {
  status: number;
  body: unknown;
}

/** Thrown inside handlers; converted to the standard error envelope. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBodyDto,
  ) {
    super(body.error.message);
  }
}

export function fail(
  status: number,
  code: string,
  message: string,
  extra: Partial<ApiErrorBodyDto['error']> = {},
): never {
  throw new HttpError(status, { error: { code, message, request_id: `mock-${Date.now()}`, ...extra } });
}

export const ok = (body: unknown): MockResponse => ({ status: 200, body });
export const created = (body: unknown): MockResponse => ({ status: 201, body });
export const noContent = (): MockResponse => ({ status: 204, body: undefined });

let counter = 0;
export function newId(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const nowIso = () => new Date().toISOString();

export const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

export const dateOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const inr = (rupees: number): MoneyDto => ({ amount_minor: Math.round(rupees * 100), currency: 'INR' });

export const clone = <T>(value: T): T => structuredClone(value);

export function paginate<T>(items: T[], cursor: string | undefined, limit = 20) {
  const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const page = items.slice(start, start + limit);
  const next = start + limit < items.length ? String(start + limit) : null;
  return { items: page, next_cursor: next, total: items.length };
}
