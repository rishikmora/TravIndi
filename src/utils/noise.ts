import { mulberry32 } from './random';

/**
 * Seedable simplex noise (after Stefan Gustavson's public-domain reference).
 * Used on the CPU wherever geometry needs to agree with shader noise, e.g.
 * placing trees on procedurally displaced terrain.
 */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0,
  -1, -1,
]);

export interface NoiseGenerator {
  noise2D: (x: number, y: number) => number;
  noise3D: (x: number, y: number, z: number) => number;
  fbm2D: (x: number, y: number, octaves?: number, lacunarity?: number, gain?: number) => number;
  ridged2D: (x: number, y: number, octaves?: number, lacunarity?: number, gain?: number) => number;
}

export function createNoise(seed = 1337): NoiseGenerator {
  const random = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255]!;
    permMod12[i] = perm[i]! % 12;
  }

  function noise2D(xin: number, yin: number): number {
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi = permMod12[ii + perm[jj]!]! * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi]! * x0 + GRAD3[gi + 1]! * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi = permMod12[ii + i1 + perm[jj + j1]!]! * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi]! * x1 + GRAD3[gi + 1]! * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi = permMod12[ii + 1 + perm[jj + 1]!]! * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi]! * x2 + GRAD3[gi + 1]! * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  function noise3D(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else {
      if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
      else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    const corner = (tt: number, gi: number, x: number, y: number, z: number) => {
      if (tt < 0) return 0;
      tt *= tt;
      return tt * tt * (GRAD3[gi]! * x + GRAD3[gi + 1]! * y + GRAD3[gi + 2]! * z);
    };

    const n0 = corner(0.6 - x0 * x0 - y0 * y0 - z0 * z0, permMod12[ii + perm[jj + perm[kk]!]!]! * 3, x0, y0, z0);
    const n1 = corner(
      0.6 - x1 * x1 - y1 * y1 - z1 * z1,
      permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]!]!]! * 3,
      x1,
      y1,
      z1,
    );
    const n2 = corner(
      0.6 - x2 * x2 - y2 * y2 - z2 * z2,
      permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]!]!]! * 3,
      x2,
      y2,
      z2,
    );
    const n3 = corner(
      0.6 - x3 * x3 - y3 * y3 - z3 * z3,
      permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]!]!]! * 3,
      x3,
      y3,
      z3,
    );
    return 32 * (n0 + n1 + n2 + n3);
  }

  function fbm2D(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * noise2D(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / norm;
  }

  function ridged2D(x: number, y: number, octaves = 5, lacunarity = 2.1, gain = 0.5): number {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    let norm = 0;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(noise2D(x * frequency, y * frequency));
      n *= n;
      n *= weight;
      weight = Math.min(1, Math.max(0, n * 2));
      sum += n * amplitude;
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / norm;
  }

  return { noise2D, noise3D, fbm2D, ridged2D };
}
