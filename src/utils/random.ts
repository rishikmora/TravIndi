/** Small, fast, seedable PRNG (mulberry32). Deterministic scenes need this. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, maxInclusive: number) => number;
  pick: <T>(items: readonly T[]) => T;
  sign: () => 1 | -1;
  chance: (probability: number) => boolean;
  gaussian: (mean?: number, deviation?: number) => number;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, maxInclusive) => Math.floor(min + (maxInclusive - min + 1) * next()),
    pick: (items) => items[Math.floor(next() * items.length) % items.length] as (typeof items)[number],
    sign: () => (next() < 0.5 ? -1 : 1),
    chance: (p) => next() < p,
    gaussian: (mean = 0, deviation = 1) => {
      const u = Math.max(1e-9, next());
      const v = next();
      return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

/** Stable 32-bit hash for strings, used to derive seeds from ids. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
