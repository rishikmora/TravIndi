/**
 * Builds lightweight India map data from @svg-maps/india (CC BY 4.0).
 *
 *  - Converts every relative path to absolute polylines
 *  - Simplifies rings with Ramer–Douglas–Peucker
 *  - Computes bounding boxes and label anchors (area-weighted centroid of
 *    the largest ring)
 *
 * Output: src/data/generated/india-map.ts
 * Run:    node scripts/generate-india-map.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import map from '../node_modules/@svg-maps/india/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseRings(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
  const rings = [];
  let ring = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = null;
  let i = 0;
  const num = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    const token = tokens[i];
    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      i++;
      if (command === 'z' || command === 'Z') {
        if (ring && ring.length > 2) rings.push(ring);
        ring = null;
        x = startX;
        y = startY;
      }
      continue;
    }
    switch (command) {
      case 'm':
      case 'M': {
        const nx = num();
        const ny = num();
        if (command === 'm') {
          x += nx;
          y += ny;
        } else {
          x = nx;
          y = ny;
        }
        if (ring && ring.length > 2) rings.push(ring);
        ring = [[x, y]];
        startX = x;
        startY = y;
        command = command === 'm' ? 'l' : 'L';
        break;
      }
      case 'l':
        x += num();
        y += num();
        ring.push([x, y]);
        break;
      case 'L':
        x = num();
        y = num();
        ring.push([x, y]);
        break;
      case 'h':
        x += num();
        ring.push([x, y]);
        break;
      case 'H':
        x = num();
        ring.push([x, y]);
        break;
      case 'v':
        y += num();
        ring.push([x, y]);
        break;
      case 'V':
        y = num();
        ring.push([x, y]);
        break;
      default:
        throw new Error(`Unsupported path command "${command}"`);
    }
  }
  if (ring && ring.length > 2) rings.push(ring);
  return rings;
}

function perpendicularDistanceSq(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2;
}

function rdp(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const epsSq = epsilon * epsilon;
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let k = start + 1; k < end; k++) {
      const dist = perpendicularDistanceSq(points[k], points[start], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = k;
      }
    }
    if (maxDist > epsSq && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

function simplifyRing(ring, epsilon) {
  // Split a closed ring at its farthest point so RDP has two stable anchors.
  let far = 0;
  let farDist = -1;
  for (let k = 1; k < ring.length; k++) {
    const d = (ring[k][0] - ring[0][0]) ** 2 + (ring[k][1] - ring[0][1]) ** 2;
    if (d > farDist) {
      farDist = d;
      far = k;
    }
  }
  const a = rdp(ring.slice(0, far + 1), epsilon);
  const b = rdp([...ring.slice(far), ring[0]], epsilon);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function ringArea(ring) {
  let area = 0;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    area += (ring[j][0] + ring[k][0]) * (ring[j][1] - ring[k][1]);
  }
  return area / 2;
}

function ringCentroid(ring) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const f = ring[j][0] * ring[k][1] - ring[k][0] * ring[j][1];
    cx += (ring[j][0] + ring[k][0]) * f;
    cy += (ring[j][1] + ring[k][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return ring[0];
  return [cx / (3 * a), cy / (3 * a)];
}

const fmt = (n) => (Math.round(n * 10) / 10).toString();
const toPath = (rings) => rings.map((r) => `M${r.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join('L')}Z`).join('');

function build(epsilon, minArea) {
  return map.locations.map((location) => {
    const rings = parseRings(location.path);
    const simplified = rings
      .map((r) => simplifyRing(r, epsilon))
      .filter((r) => r.length >= 3 && Math.abs(ringArea(r)) >= minArea);
    const kept = simplified.length ? simplified : [rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0]];
    const all = kept.flat();
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const largest = [...kept].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
    const [cx, cy] = ringCentroid(largest);
    return {
      id: location.id,
      name: location.name,
      d: toPath(kept),
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => Math.round(n * 10) / 10),
      anchor: [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10],
      area: Math.round(kept.reduce((s, r) => s + Math.abs(ringArea(r)), 0)),
    };
  });
}

const lite = build(0.9, 0.6);
const detailed = build(0.25, 0.05);

const header = `/* eslint-disable */
// Generated by scripts/generate-india-map.mjs — do not edit by hand.
// Source: @svg-maps/india by Victor Cazanave, licensed CC BY 4.0.
`;

const body = `${header}
export interface MapRegionShape {
  id: string;
  name: string;
  d: string;
  bbox: [number, number, number, number];
  anchor: [number, number];
  area: number;
}

export const INDIA_VIEWBOX = ${JSON.stringify(map.viewBox)};

/** Simplified shapes for UI maps and loaders. */
export const INDIA_MAP_LITE: MapRegionShape[] = ${JSON.stringify(lite)};
`;

const detailedBody = `${header}
import type { MapRegionShape } from './india-map';

/** Higher-fidelity shapes for rasterising the 3D terrain mask. */
export const INDIA_MAP_DETAILED: MapRegionShape[] = ${JSON.stringify(detailed)};
`;

const outDir = resolve(root, 'src/data/generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'india-map.ts'), body);
writeFileSync(resolve(outDir, 'india-map-detailed.ts'), detailedBody);

const size = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
console.log(`lite: ${size(body)}, detailed: ${size(detailedBody)}`);
for (const r of lite) {
  if (['tr', 'jk', 'an', 'dl'].includes(r.id)) console.log(r.id, r.bbox, r.anchor, r.area);
}
