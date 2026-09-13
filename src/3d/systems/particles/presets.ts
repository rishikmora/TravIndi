import type { ParticlePresetId } from '@/scenes/types';

export type ParticleShape = 'soft' | 'streak' | 'flake' | 'petal' | 'spark';

export interface ParticlePreset {
  /** Particles at quality multiplier 1. */
  count: number;
  /** Size of the volume that wraps around the camera, in world units. */
  area: [number, number, number];
  /** Volume centre relative to the camera. */
  offset?: [number, number, number];
  /** World-space diameter range. */
  size: [number, number];
  velocity: [number, number, number];
  turbulence: number;
  colors: [string, string];
  opacity: number;
  additive: boolean;
  shape: ParticleShape;
  twinkle?: number;
  /** How much the sun and sky tint the particles (0 = self-lit). */
  lit?: number;
}

/**
 * Weather and atmosphere layers. Volumes follow the camera, so a layer reads
 * as near-field weather at any world scale.
 */
export const PARTICLE_PRESETS: Record<ParticlePresetId, ParticlePreset> = {
  dust: {
    count: 900,
    area: [60, 30, 60],
    size: [0.05, 0.16],
    velocity: [0.15, 0.03, 0.05],
    turbulence: 0.9,
    colors: ['#ffe2b8', '#fff4e0'],
    opacity: 0.55,
    additive: true,
    shape: 'soft',
    twinkle: 0.35,
    lit: 0.8,
  },
  snow: {
    count: 2400,
    area: [70, 45, 70],
    size: [0.08, 0.24],
    velocity: [0.8, -2.6, 0.3],
    turbulence: 1.3,
    colors: ['#ffffff', '#e6eefa'],
    opacity: 0.85,
    additive: false,
    shape: 'flake',
    lit: 0.6,
  },
  rain: {
    count: 3200,
    area: [50, 40, 50],
    size: [0.35, 0.7],
    velocity: [1.2, -24, 0.4],
    turbulence: 0.15,
    colors: ['#cfdde4', '#e9f1f5'],
    opacity: 0.35,
    additive: false,
    shape: 'streak',
    lit: 0.5,
  },
  embers: {
    count: 520,
    area: [40, 26, 40],
    offset: [0, -4, 0],
    size: [0.05, 0.14],
    velocity: [0.3, 1.6, 0.1],
    turbulence: 1.1,
    colors: ['#ff8a2a', '#ffc15a'],
    opacity: 0.9,
    additive: true,
    shape: 'spark',
    twinkle: 0.8,
  },
  petals: {
    count: 520,
    area: [46, 30, 46],
    size: [0.14, 0.3],
    velocity: [0.6, -0.9, 0.25],
    turbulence: 1.6,
    colors: ['#f29b1f', '#ffc53a'],
    opacity: 0.95,
    additive: false,
    shape: 'petal',
    lit: 0.7,
  },
  leaves: {
    count: 380,
    area: [50, 30, 50],
    size: [0.14, 0.32],
    velocity: [0.7, -0.8, 0.2],
    turbulence: 1.8,
    colors: ['#6f8a3a', '#b3882f'],
    opacity: 0.9,
    additive: false,
    shape: 'petal',
    lit: 0.8,
  },
  sparks: {
    count: 420,
    area: [60, 40, 60],
    offset: [0, 6, 0],
    size: [0.04, 0.12],
    velocity: [0, 0.9, 0],
    turbulence: 1.4,
    colors: ['#ffd27a', '#ff9d3c'],
    opacity: 0.9,
    additive: true,
    shape: 'spark',
    twinkle: 1,
  },
  mist: {
    count: 90,
    area: [90, 18, 90],
    offset: [0, -3, 0],
    size: [9, 22],
    velocity: [0.35, 0.02, 0.12],
    turbulence: 2,
    colors: ['#e7ece8', '#ffffff'],
    opacity: 0.12,
    additive: false,
    shape: 'soft',
    lit: 0.7,
  },
  fireflies: {
    count: 260,
    area: [44, 14, 44],
    offset: [0, -2, 0],
    size: [0.06, 0.12],
    velocity: [0.05, 0.05, 0.05],
    turbulence: 1.8,
    colors: ['#d8ff7a', '#fff08a'],
    opacity: 1,
    additive: true,
    shape: 'spark',
    twinkle: 1,
  },
  stars: {
    count: 600,
    area: [400, 200, 400],
    offset: [0, 90, 0],
    size: [0.3, 0.9],
    velocity: [0, 0, 0],
    turbulence: 0,
    colors: ['#ffffff', '#cfe0ff'],
    opacity: 0.8,
    additive: true,
    shape: 'spark',
    twinkle: 0.8,
  },
  sand: {
    count: 2600,
    area: [60, 12, 60],
    offset: [0, -2, 0],
    size: [0.03, 0.09],
    velocity: [9, 0.2, 1.5],
    turbulence: 0.8,
    colors: ['#e2b27a', '#c98f55'],
    opacity: 0.6,
    additive: false,
    shape: 'soft',
    lit: 0.8,
  },
  spray: {
    count: 900,
    area: [26, 16, 26],
    size: [0.04, 0.12],
    velocity: [0.2, 1.4, 0.2],
    turbulence: 1.2,
    colors: ['#ffffff', '#dff2f5'],
    opacity: 0.55,
    additive: true,
    shape: 'soft',
    lit: 0.6,
  },
  pollen: {
    count: 700,
    area: [50, 24, 50],
    size: [0.03, 0.08],
    velocity: [0.12, 0.05, 0.08],
    turbulence: 1.1,
    colors: ['#ffeaa0', '#fff8d6'],
    opacity: 0.7,
    additive: true,
    shape: 'soft',
    twinkle: 0.5,
    lit: 0.6,
  },
  colour: {
    count: 140,
    area: [50, 20, 50],
    offset: [0, 0, 0],
    size: [2.5, 7],
    velocity: [0.6, 0.35, 0.2],
    turbulence: 1.6,
    colors: ['#ff4fa3', '#ffd23f'],
    opacity: 0.3,
    additive: false,
    shape: 'soft',
  },
};

export const PARTICLE_SHAPE_CODES: Record<ParticleShape, number> = {
  soft: 0,
  streak: 1,
  flake: 2,
  petal: 3,
  spark: 4,
};
