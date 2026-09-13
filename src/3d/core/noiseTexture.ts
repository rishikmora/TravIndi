import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';

/**
 * Tileable noise baked once on the CPU and sampled by the sky, cloud, ocean
 * and scene-transition shaders. A texture fetch replaces five octaves of
 * hashed value noise per pixel — the same look for a fraction of the GPU work,
 * which matters most on integrated graphics.
 *
 *   R: 5-octave fbm · G: 3-octave fbm · B: single-octave value noise · A: white noise
 *
 * One tile spans `NOISE_CELLS` lattice cells, so shaders sample `p / NOISE_CELLS`
 * to match the scale of the procedural `fbm(p)` they replaced.
 */
export const NOISE_CELLS = 32;
const SIZE = 512;

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise whose lattice wraps every `period` cells, so the texture tiles seamlessly. */
function periodicValueNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % period) + period) % period;
  const y0 = ((iy % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function tileableFbm(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave++) {
    // Integer offsets decorrelate octaves without breaking periodicity.
    value += amplitude * periodicValueNoise(x * frequency + octave * 11, y * frequency + octave * 7, NOISE_CELLS * frequency, seed + octave);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

let shared: DataTexture | null = null;

export function getNoiseTexture(): DataTexture {
  if (shared) return shared;
  const data = new Uint8Array(SIZE * SIZE * 4);
  const scale = NOISE_CELLS / SIZE;
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const x = (px + 0.5) * scale;
      const y = (py + 0.5) * scale;
      const i = (py * SIZE + px) * 4;
      data[i] = Math.round(Math.min(1, tileableFbm(x, y, 5, 101)) * 255);
      data[i + 1] = Math.round(Math.min(1, tileableFbm(x, y, 3, 211)) * 255);
      data[i + 2] = Math.round(periodicValueNoise(x, y, NOISE_CELLS, 307) * 255);
      data[i + 3] = Math.round(hash(px, py, 409) * 255);
    }
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  shared = texture;
  return texture;
}
