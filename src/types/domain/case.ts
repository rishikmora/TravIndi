/**
 * Type-level snake_case ⇄ camelCase conversion so domain types are derived
 * from the wire contract instead of being maintained twice.
 */

type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

type SnakeCase<S extends string> = S extends `${infer First}${infer Rest}`
  ? `${First extends Lowercase<First> ? First : `_${Lowercase<First>}`}${SnakeCase<Rest>}`
  : S;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

// Arrays and tuples are mapped element-wise with a homomorphic mapped type, so
// fixed-length tuples such as `[lng, lat]` keep their length.
export type Camelize<T> = T extends Primitive
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends readonly unknown[]
      ? { [K in keyof T]: Camelize<T[K]> }
      : { [K in keyof T as K extends string ? CamelCase<K> : K]: Camelize<T[K]> };

export type Snakeize<T> = T extends Primitive
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends readonly unknown[]
      ? { [K in keyof T]: Snakeize<T[K]> }
      : { [K in keyof T as K extends string ? SnakeCase<K> : K]: Snakeize<T[K]> };
