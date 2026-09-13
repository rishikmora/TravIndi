import { clamp, lerp, smoothstep } from '@/utils/math';
import { createNoise, type NoiseGenerator } from '@/utils/noise';
import { TERRAIN_SIZE, VERTICAL_SCALE, worldToGeo } from './geo';

/**
 * The India relief as plain typed arrays. Deliberately free of three.js and
 * the DOM so it can run in a Web Worker: at high detail the grid has hundreds
 * of thousands of vertices, and shaping them on the main thread would stall
 * the page.
 */

type Line = ReadonlyArray<readonly [lat: number, lng: number]>;

const DEG = Math.PI / 180;

/** Main Himalayan arc, west to east. Exported for placing cloud banks. */
export const HIMALAYA: Line = [
  [36.2, 71.2],
  [35.7, 74.4],
  [34.7, 76.6],
  [33.1, 78.4],
  [31.4, 79.4],
  [30.2, 80.9],
  [28.9, 83.4],
  [28.0, 86.4],
  [27.8, 88.2],
  [27.9, 90.6],
  [28.0, 93.0],
  [28.4, 95.4],
  [28.0, 97.4],
  [27.2, 98.6],
];
const WEST_RANGES: Line = [
  [36.4, 71.0],
  [34.6, 70.3],
  [32.4, 69.6],
  [30.0, 68.6],
  [27.6, 67.3],
  [25.6, 66.9],
];
const WESTERN_GHATS: Line = [
  [21.3, 73.6],
  [19.2, 73.55],
  [17.2, 73.75],
  [15.2, 74.2],
  [13.2, 75.1],
  [11.5, 76.3],
  [10.1, 77.05],
  [8.5, 77.3],
];
const EASTERN_GHATS: Line = [
  [21.7, 85.6],
  [19.6, 84.1],
  [18.0, 82.7],
  [16.6, 80.9],
  [14.6, 79.2],
  [12.9, 78.6],
  [11.7, 78.1],
];
const ARAVALLI: Line = [
  [28.4, 77.1],
  [27.1, 76.1],
  [25.7, 74.3],
  [24.4, 73.1],
];
const VINDHYA: Line = [
  [24.1, 74.7],
  [23.4, 77.4],
  [24.0, 80.4],
  [24.7, 82.6],
];
const SATPURA: Line = [
  [21.6, 74.2],
  [22.0, 76.4],
  [22.4, 78.5],
  [22.6, 80.9],
];
const NORTHEAST: Line = [
  [27.4, 91.8],
  [26.2, 93.7],
  [24.9, 94.3],
  [23.4, 93.4],
  [22.0, 92.9],
];
const MEGHALAYA: Line = [
  [25.6, 90.1],
  [25.5, 91.7],
  [25.75, 92.6],
];
const ARAKAN: Line = [
  [22.0, 93.0],
  [19.5, 94.2],
  [17.0, 94.8],
];

interface LineHit {
  distance: number;
  /** +1 left of the line's direction (north for west→east lines). */
  side: number;
}

function lineDistance(lat: number, lng: number, line: Line): LineHit {
  const k = Math.cos(lat * DEG);
  const px = lng * k;
  const py = lat;
  let best = Infinity;
  let side = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i]![1] * k;
    const ay = line[i]![0];
    const bx = line[i + 1]![1] * k;
    const by = line[i + 1]![0];
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) {
      best = d;
      side = Math.sign(dx * (py - ay) - dy * (px - ax)) || 1;
    }
  }
  return { distance: best, side };
}

const gauss = (d: number, width: number) => Math.exp(-((d / width) ** 2));

interface ElevationSample {
  height: number;
  detail: number;
  plateau: number;
  ghats: number;
}

/** Approximate relief of South Asia in kilometres, built from named ranges. */
function elevation(lat: number, lng: number, noise: NoiseGenerator): ElevationSample {
  const ridge = noise.ridged2D(lng * 1.7, lat * 1.7, 5);
  const detail = noise.fbm2D(lng * 3.1, lat * 3.1, 3) * 0.5 + 0.5;
  let h = 0.05 + 0.06 * detail;
  let plateau = 0;
  let ghats = 99;

  if (lat > 24) {
    const him = lineDistance(lat, lng, HIMALAYA);
    // Broad massifs with long ridgelines rather than repeating cones.
    const massif = noise.fbm2D(lng * 0.42 + 11, lat * 0.42 - 7, 3) * 0.5 + 0.5;
    const ridgeline = noise.ridged2D(lng * 1.05 + 3.1, lat * 1.2 - 1.7, 4);
    h += 6.6 * gauss(him.distance, 0.9) * (0.3 + 0.5 * ridgeline + 0.45 * massif);
    if (him.side < 0) {
      h += 1.1 * gauss(him.distance - 1.05, 0.6) * (0.35 + 0.65 * ridgeline);
    } else {
      plateau = smoothstep(0.3, 1.7, him.distance) * (1 - smoothstep(9, 14, him.distance));
      h = Math.max(h, plateau * (4.2 + 0.7 * massif + 0.5 * ridgeline * detail));
    }
  }
  if (lng < 71.5 && lat > 24) {
    h += 2.0 * gauss(lineDistance(lat, lng, WEST_RANGES).distance, 0.9) * (0.3 + 0.8 * ridge);
  }
  if (lat < 22.8 && lng < 78.5) {
    ghats = lineDistance(lat, lng, WESTERN_GHATS).distance;
    h += 1.25 * gauss(ghats, 0.42) * (0.45 + 0.75 * ridge);
  }
  if (lat < 22.5 && lng > 77) {
    h += 0.7 * gauss(lineDistance(lat, lng, EASTERN_GHATS).distance, 0.5) * (0.3 + 0.8 * ridge);
  }
  if (lat > 23.5 && lat < 29 && lng > 72 && lng < 78) {
    h += 0.6 * gauss(lineDistance(lat, lng, ARAVALLI).distance, 0.35) * (0.4 + 0.8 * ridge);
  }
  if (lat > 20.5 && lat < 26 && lng > 73 && lng < 84) {
    h += 0.45 * gauss(lineDistance(lat, lng, VINDHYA).distance, 0.4) * (0.4 + 0.7 * ridge);
    h += 0.5 * gauss(lineDistance(lat, lng, SATPURA).distance, 0.4) * (0.4 + 0.7 * ridge);
  }
  if (lng > 89.5) {
    h += 1.6 * gauss(lineDistance(lat, lng, NORTHEAST).distance, 0.85) * (0.4 + 0.8 * ridge);
    h += 0.95 * gauss(lineDistance(lat, lng, MEGHALAYA).distance, 0.4) * (0.5 + 0.5 * detail);
    h += 1.3 * gauss(lineDistance(lat, lng, ARAKAN).distance, 0.7) * (0.35 + 0.8 * ridge);
  }

  const deccan = smoothstep(23.0, 20.8, lat) * smoothstep(73.4, 74.6, lng) * (1 - smoothstep(81.5, 84.5, lng)) * smoothstep(8, 10.5, lat);
  h += deccan * (0.5 + (0.18 * (78.5 - lng)) / 5 + 0.12 * detail);
  h += 0.45 * Math.exp(-(((lat - 23.3) / 1.4) ** 2) - ((lng - 85.0) / 1.9) ** 2);
  h += 0.3 * Math.exp(-(((lat - 23.5) / 1.3) ** 2) - ((lng - 76.0) / 2.2) ** 2);
  h += 0.6 * Math.exp(-(((lat - 10.6) / 0.9) ** 2) - ((lng - 77.0) / 0.35) ** 2);
  h += 0.9 * Math.exp(-(((lat - 7.1) / 0.45) ** 2) - ((lng - 80.75) / 0.35) ** 2);

  const thar = Math.exp(-(((lat - 26.9) / 2.2) ** 2) - ((lng - 71.3) / 2.0) ** 2);
  h += thar * 0.16 * (0.5 + 0.5 * Math.sin(lng * 11 + lat * 4 + detail * 6));

  return { height: h, detail, plateau, ghats };
}

/** Land outside India's mask: continental Asia north of the coasts, and Sri Lanka. */
function neighbourLand(lat: number, lng: number): number {
  let coast: number;
  if (lng < 66.5) coast = 25.3;
  else if (lng < 68.6) coast = lerp(24.9, 23.7, (lng - 66.5) / 2.1);
  else if (lng < 88.0) coast = 24.3;
  else if (lng < 92.4) coast = 22.0;
  else if (lng < 94.5) coast = 21.0 - (lng - 92.4) * 2.4;
  else if (lng < 97.5) coast = 16.0;
  else coast = 10.0;

  let v = smoothstep(coast - 0.25, coast + 0.25, lat);
  const lanka = ((lat - 7.85) / 1.95) ** 2 + ((lng - 80.75) / 1.0) ** 2;
  v = Math.max(v, smoothstep(1.1, 0.85, lanka));
  return v;
}

function moisture(lat: number, lng: number, noise: NoiseGenerator, ghats: number): number {
  let m = 0.45 + 0.15 * noise.fbm2D(lng * 0.9 + 40, lat * 0.9, 3);
  m += 0.4 * gauss(ghats - 0.3, 1.1) * (lat < 21 ? 1 : 0.4);
  m += 0.35 * smoothstep(84, 89, lng) * smoothstep(19, 23, lat);
  m += 0.35 * smoothstep(89.5, 92, lng) * smoothstep(21, 24, lat);
  m += 0.25 * smoothstep(12, 8.5, lat);
  m += 0.18 * gauss(lat - 26.3, 2.0) * smoothstep(76, 80, lng) * (1 - smoothstep(88, 90, lng));
  m -= 0.62 * Math.exp(-(((lat - 26.8) / 3.2) ** 2) - ((lng - 70.8) / 3.3) ** 2);
  m -= 0.45 * smoothstep(69, 65, lng);
  m -= 0.25 * smoothstep(21, 18, lat) * smoothstep(76, 78, lng) * (1 - smoothstep(80, 82, lng));
  return clamp(m);
}

type Rgb = readonly [number, number, number];

/** Same sRGB → linear conversion three.js applies to `new Color('#hex')`. */
function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function hex(value: string): Rgb {
  const n = parseInt(value.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

const PALETTE = {
  desert: hex('#c9a26c'),
  dry: hex('#9a8458'),
  savanna: hex('#7c874b'),
  green: hex('#56713a'),
  lush: hex('#3b582c'),
  rock: hex('#766960'),
  tibet: hex('#9d8a70'),
  snow: hex('#eef2f6'),
  beach: hex('#d6c29a'),
  seabed: hex('#27413f'),
};

function mixInto(out: number[], color: Rgb, t: number) {
  out[0] = out[0]! + (color[0] - out[0]!) * t;
  out[1] = out[1]! + (color[1] - out[1]!) * t;
  out[2] = out[2]! + (color[2] - out[2]!) * t;
}

function shade(out: number[], h: number, land: number, m: number, detail: number, plateau: number, ny: number) {
  if (h < -0.05) {
    out[0] = PALETTE.seabed[0];
    out[1] = PALETTE.seabed[1];
    out[2] = PALETTE.seabed[2];
    return;
  }
  out[0] = PALETTE.desert[0];
  out[1] = PALETTE.desert[1];
  out[2] = PALETTE.desert[2];
  mixInto(out, PALETTE.dry, smoothstep(0.08, 0.34, m));
  mixInto(out, PALETTE.savanna, smoothstep(0.34, 0.5, m));
  mixInto(out, PALETTE.green, smoothstep(0.5, 0.7, m));
  mixInto(out, PALETTE.lush, smoothstep(0.72, 0.92, m));
  mixInto(out, PALETTE.rock, clamp(smoothstep(1.2, 2.8, h) * (0.6 + 0.4 * (1 - ny))));
  mixInto(out, PALETTE.tibet, plateau * smoothstep(2.8, 4.2, h) * 0.8);
  mixInto(out, PALETTE.snow, clamp(smoothstep(4.9, 6.1, h + detail * 1.4) * smoothstep(0.35, 0.72, ny)));
  const beach = (1 - smoothstep(0.12, 0.45, h)) * (1 - smoothstep(0.5, 0.72, land)) * smoothstep(0.3, 0.45, land);
  mixInto(out, PALETTE.beach, clamp(beach * 0.85));
  const scale = 0.9 + detail * 0.2;
  out[0] = out[0]! * scale;
  out[1] = out[1]! * scale;
  out[2] = out[2]! * scale;
}

/**
 * Grid warp: the inner 82% of the grid keeps uniform spacing over India;
 * beyond it spacing grows smoothly (up to 12×) so the mesh reaches about
 * twice as far for free. `warp` maps grid → world (normalised), `unwarp` back.
 */
const WARP_INNER = 0.82;
const WARP_GROWTH = 12;
const WARP_K = (WARP_GROWTH - 1) / (2 * (1 - WARP_INNER));

function warp(n: number) {
  const a = Math.abs(n);
  const d = Math.max(0, a - WARP_INNER);
  return Math.sign(n) * (a + WARP_K * d * d);
}

function unwarp(w: number) {
  const a = Math.abs(w);
  if (a <= WARP_INNER) return Math.sign(w) * a;
  const d = (-1 + Math.sqrt(1 + 4 * WARP_K * (a - WARP_INNER))) / (2 * WARP_K);
  return Math.sign(w) * Math.min(1, WARP_INNER + d);
}

export interface TerrainMaskInput {
  /** Softened land coverage, row 0 = north. */
  land: Float32Array;
  width: number;
  height: number;
}

export interface TerrainData {
  segX: number;
  segZ: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /** World-space surface height per vertex (row-major, same order as positions). */
  heights: Float32Array;
}

/**
 * Builds the relief grid: vertex positions (same layout and triangle winding as
 * a rotated `PlaneGeometry`), smooth normals from the warped grid, biome
 * colours in linear space and an index buffer.
 */
export function buildTerrainData(mask: TerrainMaskInput, segments: number): TerrainData {
  const noise = createNoise(20260912);
  const { width: W, depth: D } = TERRAIN_SIZE;
  const segX = segments;
  const segZ = Math.round((segments * D) / W);
  const columns = segX + 1;
  const rows = segZ + 1;
  const count = columns * rows;

  const sampleLand = (u: number, v: number) => {
    const x = clamp(u) * (mask.width - 1);
    const y = clamp(v) * (mask.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(mask.width - 1, x0 + 1);
    const y1 = Math.min(mask.height - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const land = mask.land;
    const a = land[y0 * mask.width + x0]!;
    const b = land[y0 * mask.width + x1]!;
    const c = land[y1 * mask.width + x0]!;
    const d = land[y1 * mask.width + x1]!;
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };

  const positions = new Float32Array(count * 3);
  const heights = new Float32Array(count);
  const kilometres = new Float32Array(count);
  const lands = new Float32Array(count);
  const moistures = new Float32Array(count);
  const details = new Float32Array(count);
  const plateaus = new Float32Array(count);

  for (let iz = 0; iz < rows; iz++) {
    const nz = (iz / segZ) * 2 - 1;
    const z = warp(nz) * (D / 2);
    for (let ix = 0; ix < columns; ix++) {
      const i = iz * columns + ix;
      const nx = (ix / segX) * 2 - 1;
      const x = warp(nx) * (W / 2);

      const u = (x + W / 2) / W;
      const v = (z + D / 2) / D;
      const { lat, lng } = worldToGeo(x, z);

      const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      const land = Math.max(inside ? sampleLand(u, v) : 0, neighbourLand(lat, lng));
      const sample = elevation(lat, lng, noise);
      const coast = smoothstep(0.34, 0.66, land);
      const edge = 1 - smoothstep(0.94, 1, Math.max(Math.abs(nx), Math.abs(nz)));

      let h = lerp(-1.1 - 0.8 * (1 - land), sample.height, coast);
      h = lerp(Math.min(h, 0), h, edge);

      const y = h * VERTICAL_SCALE;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      heights[i] = y;
      kilometres[i] = h;
      lands[i] = land;
      moistures[i] = moisture(lat, lng, noise, sample.ghats);
      details[i] = sample.detail;
      plateaus[i] = sample.plateau;
    }
  }

  // Smooth normals from neighbouring vertices of the (warped) grid.
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = [0, 0, 0];
  for (let iz = 0; iz < rows; iz++) {
    const up = (iz > 0 ? iz - 1 : iz) * columns;
    const down = (iz < segZ ? iz + 1 : iz) * columns;
    const row = iz * columns;
    for (let ix = 0; ix < columns; ix++) {
      const i = row + ix;
      const left = row + (ix > 0 ? ix - 1 : ix);
      const right = row + (ix < segX ? ix + 1 : ix);
      const north = up + ix;
      const south = down + ix;
      const txX = positions[right * 3]! - positions[left * 3]!;
      const txY = positions[right * 3 + 1]! - positions[left * 3 + 1]!;
      const txZ = positions[right * 3 + 2]! - positions[left * 3 + 2]!;
      const tzX = positions[south * 3]! - positions[north * 3]!;
      const tzY = positions[south * 3 + 1]! - positions[north * 3 + 1]!;
      const tzZ = positions[south * 3 + 2]! - positions[north * 3 + 2]!;
      // n = tz × tx (points up on flat ground)
      let nx = tzY * txZ - tzZ * txY;
      let ny = tzZ * txX - tzX * txZ;
      let nz = tzX * txY - tzY * txX;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      normals[i * 3] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;

      shade(color, kilometres[i]!, lands[i]!, moistures[i]!, details[i]!, plateaus[i]!, ny);
      colors[i * 3] = color[0]!;
      colors[i * 3 + 1] = color[1]!;
      colors[i * 3 + 2] = color[2]!;
    }
  }

  const indices = new Uint32Array(segX * segZ * 6);
  let k = 0;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = ix + columns * iz;
      const b = ix + columns * (iz + 1);
      const c = ix + 1 + columns * (iz + 1);
      const d = ix + 1 + columns * iz;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  return { segX, segZ, positions, normals, colors, indices, heights };
}

/** World-space surface height (bilinear on the warped terrain grid). */
export function createHeightSampler(data: Pick<TerrainData, 'segX' | 'segZ' | 'heights'>) {
  const { width: W, depth: D } = TERRAIN_SIZE;
  const { segX, segZ, heights } = data;
  const row = segX + 1;
  return (x: number, z: number) => {
    const fx = clamp((unwarp(x / (W / 2)) + 1) / 2) * segX;
    const fz = clamp((unwarp(z / (D / 2)) + 1) / 2) * segZ;
    const ix = Math.min(segX - 1, Math.floor(fx));
    const iz = Math.min(segZ - 1, Math.floor(fz));
    const tx = fx - ix;
    const tz = fz - iz;
    const a = heights[iz * row + ix]!;
    const b = heights[iz * row + ix + 1]!;
    const c = heights[(iz + 1) * row + ix]!;
    const d = heights[(iz + 1) * row + ix + 1]!;
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };
}
