import { Color, Vector2, Vector3 } from 'three';

/**
 * Uniform objects shared by every custom material. Materials reference these
 * exact objects, so the environment controller updates the whole world with a
 * single write per frame.
 */
export const globalUniforms = {
  uTime: { value: 0 },
  uSunDirection: { value: new Vector3(0.4, 0.3, -1).normalize() },
  uSunColor: { value: new Color('#ffd9a0') },
  uSunIntensity: { value: 1 },
  uSkyZenith: { value: new Color('#1a2a4a') },
  uSkyHorizon: { value: new Color('#e8b48a') },
  uGroundColor: { value: new Color('#2a2420') },
  uFogColor: { value: new Color('#c9b79c') },
  uFogDensity: { value: 0.002 },
  uFogHeight: { value: 0 },
  uHemiSky: { value: new Color('#9fb4d8') },
  uHemiGround: { value: new Color('#3b2f25') },
  uHemiIntensity: { value: 0.6 },
  uStars: { value: 0 },
  uClouds: { value: 0.4 },
  uCloudColor: { value: new Color('#ffffff') },
  uSunDiscSize: { value: 1 },
  uWindDirection: { value: new Vector2(1, 0.25).normalize() },
  uWindStrength: { value: 0.5 },
  uWetness: { value: 0 },
  uNight: { value: 0 },
  uResolution: { value: new Vector2(1920, 1080) },
  uPixelRatio: { value: 1 },
};

export type GlobalUniforms = typeof globalUniforms;

/**
 * Values consumed by post-processing effects. Kept separate from material
 * uniforms because effects copy them in their own update step.
 */
export const postState = {
  exposure: 1,
  contrast: 1,
  saturation: 1,
  vignette: 0.35,
  grain: 0.03,
  warmth: 0,
  bloom: 0.6,
  heatHaze: 0,
  transitionAmount: 0,
  transitionType: 0,
  transitionColor: new Color('#000000'),
  transitionCenter: new Vector2(0.5, 0.5),
  focusDistance: 0,
  focusRange: 0,
  bokeh: 0,
};
