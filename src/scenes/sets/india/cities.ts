import { BufferGeometry, Float32BufferAttribute } from 'three';
import { clamp, smoothstep, TAU } from '@/utils/math';
import { createRng } from '@/utils/random';
import { geoToWorld, worldToGeo, worldToMaskUv } from './geo';
import type { IndiaMask } from './mask';

interface CityLight {
  name: string;
  lat: number;
  lng: number;
  /** 0–1, roughly proportional to metropolitan size. */
  weight: number;
  neighbour?: boolean;
}

export const CITY_LIGHTS: CityLight[] = [
  { name: 'Delhi', lat: 28.61, lng: 77.21, weight: 1 },
  { name: 'Mumbai', lat: 19.08, lng: 72.88, weight: 1 },
  { name: 'Kolkata', lat: 22.57, lng: 88.36, weight: 0.85 },
  { name: 'Bengaluru', lat: 12.97, lng: 77.59, weight: 0.85 },
  { name: 'Chennai', lat: 13.08, lng: 80.27, weight: 0.8 },
  { name: 'Hyderabad', lat: 17.39, lng: 78.49, weight: 0.8 },
  { name: 'Ahmedabad', lat: 23.02, lng: 72.57, weight: 0.6 },
  { name: 'Pune', lat: 18.52, lng: 73.86, weight: 0.6 },
  { name: 'Surat', lat: 21.17, lng: 72.83, weight: 0.45 },
  { name: 'Jaipur', lat: 26.91, lng: 75.79, weight: 0.45 },
  { name: 'Lucknow', lat: 26.85, lng: 80.95, weight: 0.45 },
  { name: 'Kanpur', lat: 26.45, lng: 80.33, weight: 0.35 },
  { name: 'Nagpur', lat: 21.15, lng: 79.09, weight: 0.35 },
  { name: 'Indore', lat: 22.72, lng: 75.86, weight: 0.35 },
  { name: 'Bhopal', lat: 23.26, lng: 77.41, weight: 0.3 },
  { name: 'Patna', lat: 25.59, lng: 85.14, weight: 0.35 },
  { name: 'Vadodara', lat: 22.31, lng: 73.18, weight: 0.3 },
  { name: 'Ludhiana', lat: 30.9, lng: 75.86, weight: 0.3 },
  { name: 'Agra', lat: 27.18, lng: 78.01, weight: 0.28 },
  { name: 'Varanasi', lat: 25.32, lng: 82.97, weight: 0.28 },
  { name: 'Kochi', lat: 9.93, lng: 76.27, weight: 0.3 },
  { name: 'Thiruvananthapuram', lat: 8.52, lng: 76.94, weight: 0.25 },
  { name: 'Coimbatore', lat: 11.02, lng: 76.96, weight: 0.3 },
  { name: 'Madurai', lat: 9.93, lng: 78.12, weight: 0.25 },
  { name: 'Visakhapatnam', lat: 17.69, lng: 83.22, weight: 0.3 },
  { name: 'Bhubaneswar', lat: 20.3, lng: 85.82, weight: 0.25 },
  { name: 'Guwahati', lat: 26.14, lng: 91.74, weight: 0.25 },
  { name: 'Chandigarh', lat: 30.73, lng: 76.78, weight: 0.25 },
  { name: 'Amritsar', lat: 31.63, lng: 74.87, weight: 0.22 },
  { name: 'Srinagar', lat: 34.08, lng: 74.8, weight: 0.2 },
  { name: 'Dehradun', lat: 30.32, lng: 78.03, weight: 0.18 },
  { name: 'Raipur', lat: 21.25, lng: 81.63, weight: 0.22 },
  { name: 'Ranchi', lat: 23.34, lng: 85.31, weight: 0.2 },
  { name: 'Panaji', lat: 15.49, lng: 73.83, weight: 0.18 },
  { name: 'Mysuru', lat: 12.3, lng: 76.64, weight: 0.2 },
  { name: 'Vijayawada', lat: 16.51, lng: 80.65, weight: 0.25 },
  { name: 'Mangaluru', lat: 12.91, lng: 74.86, weight: 0.18 },
  { name: 'Jodhpur', lat: 26.24, lng: 73.02, weight: 0.2 },
  { name: 'Udaipur', lat: 24.59, lng: 73.71, weight: 0.15 },
  { name: 'Leh', lat: 34.15, lng: 77.58, weight: 0.08 },
  { name: 'Shillong', lat: 25.58, lng: 91.89, weight: 0.12 },
  { name: 'Imphal', lat: 24.82, lng: 93.94, weight: 0.12 },
  { name: 'Agartala', lat: 23.83, lng: 91.29, weight: 0.12 },
  { name: 'Sri Vijaya Puram', lat: 11.62, lng: 92.73, weight: 0.08 },
  { name: 'Karachi', lat: 24.86, lng: 67.0, weight: 0.6, neighbour: true },
  { name: 'Lahore', lat: 31.55, lng: 74.34, weight: 0.65, neighbour: true },
  { name: 'Dhaka', lat: 23.81, lng: 90.41, weight: 0.75, neighbour: true },
  { name: 'Kathmandu', lat: 27.72, lng: 85.32, weight: 0.3, neighbour: true },
  { name: 'Colombo', lat: 6.93, lng: 79.86, weight: 0.35, neighbour: true },
];

/** Rough population density used to scatter smaller settlements. */
function populationDensity(lat: number, lng: number) {
  let d = 0.18;
  d += 0.55 * Math.exp(-(((lat - 26.4) / 2.0) ** 2)) * smoothstep(74.5, 78, lng) * (1 - smoothstep(88.5, 90, lng));
  d += 0.35 * smoothstep(12.5, 9, lat) * (1 - smoothstep(77.2, 78, lng));
  d += 0.3 * Math.exp(-(((lat - 23) / 1.5) ** 2) - ((lng - 88) / 1.2) ** 2);
  d += 0.2 * Math.exp(-(((lat - 11) / 1.8) ** 2) - ((lng - 78.8) / 1.4) ** 2);
  d -= 0.15 * Math.exp(-(((lat - 27) / 2.5) ** 2) - ((lng - 71) / 2.5) ** 2);
  d -= 0.15 * smoothstep(29.5, 32, lat);
  d -= 0.12 * smoothstep(89, 91, lng);
  return clamp(d, 0.02, 1);
}

export function buildCityLights(mask: IndiaMask, heightAt: (x: number, z: number) => number, density = 1) {
  const rng = createRng(42);
  const positions: number[] = [];
  const sizes: number[] = [];
  const intensities: number[] = [];
  const seeds: number[] = [];
  const warmth: number[] = [];

  const push = (x: number, z: number, size: number, intensity: number, warm: number) => {
    positions.push(x, Math.max(0, heightAt(x, z)) + 1.5, z);
    sizes.push(size);
    intensities.push(intensity);
    seeds.push(rng.next());
    warmth.push(warm);
  };

  for (const city of CITY_LIGHTS) {
    const c = geoToWorld(city);
    const dim = city.neighbour ? 0.45 : 1;
    const n = Math.round((24 + city.weight * 180) * density);
    const spread = 5 + city.weight * 22;
    push(c.x, c.z, 10 + city.weight * 26, (0.9 + city.weight * 0.6) * dim, 0.35);
    for (let i = 0; i < n; i++) {
      const r = Math.abs(rng.gaussian(0, spread));
      const a = rng.range(0, TAU);
      push(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, rng.range(2, 5.5), rng.range(0.25, 0.8) * dim, rng.range(0.55, 1));
    }
  }

  const target = Math.round(2600 * density);
  let placed = 0;
  for (let attempts = 0; placed < target && attempts < target * 14; attempts++) {
    const x = rng.range(-1000, 1600);
    const z = rng.range(-1400, 1400);
    const { u, v } = worldToMaskUv(x, z);
    if (mask.land(u, v) < 0.6) continue;
    const { lat, lng } = worldToGeo(x, z);
    if (rng.next() > populationDensity(lat, lng)) continue;
    push(x, z, rng.range(1.5, 3.2), rng.range(0.12, 0.35), rng.range(0.7, 1));
    placed++;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aIntensity', new Float32BufferAttribute(intensities, 1));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  geometry.setAttribute('aWarm', new Float32BufferAttribute(warmth, 1));
  geometry.computeBoundingSphere();
  return { geometry };
}
