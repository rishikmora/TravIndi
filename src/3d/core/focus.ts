import { Vector3 } from 'three';

/**
 * Where the active set wants the sun's shadow frustum centred. Sets update it
 * while visible; the environment controller fits the light to it.
 */
export const stageFocus = {
  center: new Vector3(),
  radius: 400,
  normalBias: 0.8,
};

export function setStageFocus(x: number, y: number, z: number, radius: number, normalBias = radius * 0.002) {
  stageFocus.center.set(x, y, z);
  stageFocus.radius = radius;
  stageFocus.normalBias = normalBias;
}
