import type { GeoPoint } from '@/data/types';
import type { CameraTrack, Vec3 } from '@/scenes/types';
import { geoToWorld } from './geo';

export const INDIA_NEAR = 2;
export const INDIA_FAR = 26000;

/** Sun direction of the 'india-sunrise' preset (azimuth 96°, elevation 7°). */
const SUNRISE_DIRECTION = [0.987, 0.122, -0.104] as const;
const INTRO_START: Vec3 = [-1400, 1300, 2900];

/**
 * The opening point of light sits exactly where the sun will rise, so the star
 * the camera drifts towards becomes the sunrise.
 */
export const INTRO_STAR_POSITION: Vec3 = [
  INTRO_START[0] + SUNRISE_DIRECTION[0] * 9000,
  INTRO_START[1] + SUNRISE_DIRECTION[1] * 9000,
  INTRO_START[2] + SUNRISE_DIRECTION[2] * 9000,
];

export const indiaIntroTrack: CameraTrack = {
  near: INDIA_NEAR,
  far: INDIA_FAR,
  keys: [
    { t: 0, position: INTRO_START, target: [1561, 1666, 2588], fov: 24 },
    { t: 0.32, position: [-1150, 1180, 2820], target: [1780, 1320, 2480], fov: 26 },
    { t: 0.62, position: [-700, 980, 2900], target: [900, 380, 1700], fov: 32 },
    { t: 0.86, position: [-260, 860, 2760], target: [80, 50, 900], fov: 36 },
    { t: 1, position: [-80, 820, 2650], target: [-60, 0, 500], fov: 38 },
  ],
};

/** Chapter 01: from above the Indian Ocean, north across the subcontinent into the Himalayan clouds. */
export const indiaBeginningTrack: CameraTrack = {
  near: INDIA_NEAR,
  far: INDIA_FAR,
  parallax: 18,
  drift: 8,
  keys: [
    { t: 0, position: [-80, 820, 2650], target: [-60, 0, 500], fov: 38 },
    { t: 0.35, position: [-40, 880, 1750], target: [-20, 0, -250], fov: 40 },
    { t: 0.7, position: [0, 720, 700], target: [20, 30, -800], fov: 42 },
    { t: 1, position: [30, 460, -250], target: [40, 150, -900], fov: 44 },
  ],
};

/** Chapter 15: rising above India at dusk while the cities light up. */
export const indiaPlanTrack: CameraTrack = {
  near: INDIA_NEAR,
  far: INDIA_FAR,
  parallax: 24,
  drift: 10,
  ease: 'inOutSine',
  keys: [
    { t: 0, position: [-200, 1500, 2600], target: [40, 0, 100], fov: 40 },
    { t: 0.5, position: [-120, 2100, 2350], target: [60, 0, 0], fov: 38 },
    { t: 1, position: [-60, 2700, 2100], target: [80, 0, -60], fov: 36 },
  ],
};

/**
 * A flyover of a region on the India relief, used for chapters whose full set
 * is unavailable (low quality, or not yet loaded). The approach direction
 * follows the journey from the previous chapter's region.
 */
export function createLiteTrack(focus: GeoPoint, from: GeoPoint | null): CameraTrack {
  const p = geoToWorld(focus);
  const f = from ? geoToWorld(from) : { x: p.x, z: p.z + 1000 };
  let dx = p.x - f.x;
  let dz = p.z - f.z;
  const length = Math.hypot(dx, dz) || 1;
  dx /= length;
  dz /= length;
  const sx = -dz;
  const sz = dx;

  const at = (back: number, side: number, height: number): Vec3 => [
    p.x - dx * back + sx * side,
    height,
    p.z - dz * back + sz * side,
  ];
  const look = (ahead: number): Vec3 => [p.x + dx * ahead, 0, p.z + dz * ahead];

  return {
    near: INDIA_NEAR,
    far: INDIA_FAR,
    parallax: 12,
    drift: 6,
    ease: 'inOutSine',
    keys: [
      { t: 0, position: at(1150, -120, 780), target: look(-250), fov: 40 },
      { t: 0.5, position: at(700, 60, 520), target: look(0), fov: 40 },
      { t: 1, position: at(320, 180, 330), target: look(260), fov: 42 },
    ],
  };
}
