import type { Camelize, Snakeize } from '@/types/domain/case';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function transformKeys(value: unknown, transform: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => transformKeys(item, transform));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[transform(key)] = transformKeys(item, transform);
  }
  return out;
}

/** Wire (snake_case) → domain (camelCase). */
export function camelizeKeys<T>(value: T): Camelize<T> {
  return transformKeys(value, toCamel) as Camelize<T>;
}

/** Domain (camelCase) → wire (snake_case). */
export function snakeizeKeys<T>(value: T): Snakeize<T> {
  return transformKeys(value, toSnake) as Snakeize<T>;
}
