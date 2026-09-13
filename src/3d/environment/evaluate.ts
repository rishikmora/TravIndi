import { Color } from 'three';
import type { EnvironmentKey, EnvironmentState } from '@/scenes/types';
import { smoothstep } from '@/utils/math';
import { ENVIRONMENT_PRESETS } from './presets';

const COLOR_KEYS = [
  'skyZenith',
  'skyHorizon',
  'groundColor',
  'sunColor',
  'hemiSky',
  'hemiGround',
  'fogColor',
  'cloudColor',
] as const;

const NUMBER_KEYS = [
  'sunIntensity',
  'sunElevation',
  'sunDiscSize',
  'hemiIntensity',
  'fogDensity',
  'fogHeight',
  'exposure',
  'bloom',
  'stars',
  'clouds',
  'saturation',
  'contrast',
  'vignette',
  'grain',
  'warmth',
  'wind',
  'wetness',
  'heatHaze',
] as const;

type ColorKey = (typeof COLOR_KEYS)[number];
type NumberKey = (typeof NUMBER_KEYS)[number];

export type ResolvedEnvironment = Record<ColorKey, Color> & Record<NumberKey, number> & { sunAzimuth: number };

export function createResolvedEnvironment(): ResolvedEnvironment {
  const env = { sunAzimuth: 0 } as ResolvedEnvironment;
  for (const key of COLOR_KEYS) env[key] = new Color();
  for (const key of NUMBER_KEYS) env[key] = 0;
  return env;
}

export function resolveEnvironment(presetId: string, overrides?: Partial<EnvironmentState>): ResolvedEnvironment {
  const presets = ENVIRONMENT_PRESETS as Record<string, EnvironmentState>;
  const source = presets[presetId];
  if (!source) throw new Error(`Unknown environment preset "${presetId}"`);
  const merged: EnvironmentState = { ...source, ...overrides };
  const env = createResolvedEnvironment();
  for (const key of COLOR_KEYS) env[key].set(merged[key]);
  for (const key of NUMBER_KEYS) env[key] = merged[key];
  env.sunAzimuth = merged.sunAzimuth;
  return env;
}

export function copyEnvironment(source: ResolvedEnvironment, out: ResolvedEnvironment) {
  for (const key of COLOR_KEYS) out[key].copy(source[key]);
  for (const key of NUMBER_KEYS) out[key] = source[key];
  out.sunAzimuth = source.sunAzimuth;
  return out;
}

/** Linear-space blend. Azimuth takes the shortest way round. `out` may alias `a` or `b`. */
export function lerpEnvironment(a: ResolvedEnvironment, b: ResolvedEnvironment, t: number, out: ResolvedEnvironment) {
  for (const key of COLOR_KEYS) out[key].lerpColors(a[key], b[key], t);
  for (const key of NUMBER_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  let delta = ((b.sunAzimuth - a.sunAzimuth + 540) % 360) - 180;
  if (Number.isNaN(delta)) delta = 0;
  out.sunAzimuth = a.sunAzimuth + delta * t;
  return out;
}

export interface ResolvedKey {
  t: number;
  env: ResolvedEnvironment;
}

export function resolveKeys(keys: EnvironmentKey[]): ResolvedKey[] {
  return [...keys].sort((a, b) => a.t - b.t).map((k) => ({ t: k.t, env: resolveEnvironment(k.preset, k.overrides) }));
}

export function evaluateKeys(keys: ResolvedKey[], t: number, out: ResolvedEnvironment) {
  if (keys.length === 0) return out;
  if (keys.length === 1 || t <= keys[0]!.t) return copyEnvironment(keys[0]!.env, out);
  const last = keys[keys.length - 1]!;
  if (t >= last.t) return copyEnvironment(last.env, out);
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.t <= t) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  return lerpEnvironment(a.env, b.env, smoothstep(a.t, b.t, t), out);
}
