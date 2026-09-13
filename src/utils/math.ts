export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const inverseLerp = (a: number, b: number, value: number) => (a === b ? 0 : (value - a) / (b - a));

export const remap = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  lerp(outMin, outMax, clamp(inverseLerp(inMin, inMax, value)));

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export const smootherstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Frame-rate independent exponential smoothing. `lambda` is roughly
 * "how many e-foldings per second" — higher is snappier.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Rises in over [a, a+fade], holds, falls out over [b-fade, b]. */
export const windowed = (t: number, a: number, b: number, fade: number) =>
  smoothstep(a, a + fade, t) * (1 - smoothstep(b - fade, b, t));

export const easing = {
  linear: (t: number) => t,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t * t * t,
  outExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  /** Slow-in, long glide, soft landing — the default for camera moves. */
  cinematic: (t: number) => {
    const c = clamp(t);
    return c * c * c * (c * (c * 6 - 15) + 10);
  },
} as const;

export type EasingName = keyof typeof easing;

export const TAU = Math.PI * 2;

export const fract = (x: number) => x - Math.floor(x);

export const degToRad = (deg: number) => (deg * Math.PI) / 180;
