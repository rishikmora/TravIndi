import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three';
import { INDIA_MAP_DETAILED } from '@/data/generated/india-map-detailed';
import { clamp } from '@/utils/math';
import { MAP_ORIGIN, TERRAIN_SIZE, WORLD_SCALE } from './geo';

export interface IndiaMask {
  /** R: crisp coverage · G: soft coverage (borders, coastline) · B: wide blur (shallows). */
  texture: DataTexture;
  width: number;
  height: number;
  /** Softened land coverage, row 0 = north. Copied into the terrain worker. */
  landData: Float32Array;
  /** Softened land coverage at mask uv (v = 0 at north). */
  land: (u: number, v: number) => number;
  dispose: () => void;
}

function drawRegions(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sx = (WORLD_SCALE * width) / TERRAIN_SIZE.width;
  const sy = (WORLD_SCALE * height) / TERRAIN_SIZE.depth;
  const ox = (-MAP_ORIGIN.x * WORLD_SCALE + TERRAIN_SIZE.width / 2) * (width / TERRAIN_SIZE.width);
  const oy = (-MAP_ORIGIN.y * WORLD_SCALE + TERRAIN_SIZE.depth / 2) * (height / TERRAIN_SIZE.depth);
  ctx.setTransform(sx, 0, 0, sy, ox, oy);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  // A hairline stroke keeps small islands (Lakshadweep, Andamans) from vanishing.
  ctx.lineWidth = 0.9 * (1024 / width);
  ctx.lineJoin = 'round';
  for (const region of INDIA_MAP_DETAILED) {
    const path = new Path2D(region.d);
    ctx.fill(path);
    ctx.stroke(path);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function blur(source: HTMLCanvasElement, radius: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.filter = `blur(${radius}px)`;
  const filterSupported = ctx.filter === `blur(${radius}px)`;
  if (filterSupported) {
    ctx.drawImage(source, 0, 0);
    ctx.filter = 'none';
  } else {
    // Approximate a Gaussian with rings of offset, translucent copies.
    ctx.filter = 'none';
    const rings = 3;
    const taps = 12;
    ctx.globalAlpha = 1 / (rings * taps * 0.5);
    for (let r = 1; r <= rings; r++) {
      for (let i = 0; i < taps; i++) {
        const a = (i / taps) * Math.PI * 2;
        ctx.drawImage(source, Math.cos(a) * radius * (r / rings), Math.sin(a) * radius * (r / rings));
      }
    }
    ctx.globalAlpha = 1;
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Rasterises India's official outline into a multi-channel terrain mask. */
export function buildIndiaMask(resolution = 1024): IndiaMask {
  const width = resolution;
  const height = Math.round((resolution * TERRAIN_SIZE.depth) / TERRAIN_SIZE.width);

  const sharp = document.createElement('canvas');
  sharp.width = width;
  sharp.height = height;
  const ctx = sharp.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  drawRegions(ctx, width, height);

  const scale = width / 1024;
  const crisp = ctx.getImageData(0, 0, width, height).data;
  const soft = blur(sharp, 2.5 * scale);
  const wide = blur(sharp, 18 * scale);

  const pixels = width * height;
  const data = new Uint8Array(pixels * 4);
  const land = new Float32Array(pixels);
  for (let i = 0, p = 0; i < pixels; i++, p += 4) {
    data[p] = crisp[p]!;
    data[p + 1] = soft[p]!;
    data[p + 2] = wide[p]!;
    data[p + 3] = 255;
    land[i] = soft[p]! / 255;
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const sampleLand = (u: number, v: number) => {
    const x = clamp(u) * (width - 1);
    const y = clamp(v) * (height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const a = land[y0 * width + x0]!;
    const b = land[y0 * width + x1]!;
    const c = land[y1 * width + x0]!;
    const d = land[y1 * width + x1]!;
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };

  return { texture, width, height, landData: land, land: sampleLand, dispose: () => texture.dispose() };
}
