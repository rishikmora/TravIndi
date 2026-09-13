import type { GeoPoint } from '@/data/types';
import { projectToMap, unprojectFromMap } from '@/utils/geo';

/** World units per SVG map unit (≈ 1.33 km per world unit). */
export const WORLD_SCALE = 4;
/** Map coordinate placed at the world origin — roughly central India. */
export const MAP_ORIGIN = { x: 230, y: 348 } as const;
/**
 * Full-resolution terrain extent (and terrain-mask coverage). The mesh itself
 * extends roughly twice as far with progressively coarser cells, so land runs
 * to the horizon without a visible edge.
 */
export const TERRAIN_SIZE = { width: 4000, depth: 3900 } as const;
/** Relief exaggeration applied to heights expressed in kilometres. */
export const VERTICAL_SCALE = 11;

export function mapToWorld(x: number, y: number) {
  return { x: (x - MAP_ORIGIN.x) * WORLD_SCALE, z: (y - MAP_ORIGIN.y) * WORLD_SCALE };
}

export function geoToWorld(point: GeoPoint) {
  const p = projectToMap(point);
  return mapToWorld(p.x, p.y);
}

export function worldToGeo(x: number, z: number): GeoPoint {
  return unprojectFromMap({ x: x / WORLD_SCALE + MAP_ORIGIN.x, y: z / WORLD_SCALE + MAP_ORIGIN.y });
}

/** Terrain-mask texture coordinates; v = 0 at the northern edge. */
export function worldToMaskUv(x: number, z: number) {
  return {
    u: (x + TERRAIN_SIZE.width / 2) / TERRAIN_SIZE.width,
    v: (z + TERRAIN_SIZE.depth / 2) / TERRAIN_SIZE.depth,
  };
}
