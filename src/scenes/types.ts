import type { EasingName } from '@/utils/math';

export type Vec3 = [number, number, number];

/** Scene worlds the engine can mount. Each lives in /scenes/sets/<id>. */
export type SetId =
  | 'india'
  | 'himalaya'
  | 'ganga'
  | 'hampi'
  | 'temple'
  | 'battlefield'
  | 'taj'
  | 'forest'
  | 'coast'
  | 'desert'
  | 'festival'
  | 'food'
  | 'city'
  | 'meghalaya';

export type ChapterId =
  | 'beginning'
  | 'mountains'
  | 'rivers'
  | 'kingdoms'
  | 'temples'
  | 'empires'
  | 'monuments'
  | 'forests'
  | 'coast'
  | 'desert'
  | 'festivals'
  | 'food'
  | 'city'
  | 'hidden'
  | 'plan';

export interface CameraKey {
  /** Local chapter time, 0–1. */
  t: number;
  position: Vec3;
  target: Vec3;
  /** Vertical field of view designed for a 16:9 frame. */
  fov?: number;
  roll?: number;
}

export interface CameraTrack {
  keys: CameraKey[];
  /** Easing applied to the chapter's local time before sampling. */
  ease?: EasingName;
  /** Pointer parallax amplitude in world units. */
  parallax?: number;
  /** Idle drift amplitude in world units. */
  drift?: number;
  /** Handheld shake amplitude (0 = locked off). */
  shake?: number;
  near?: number;
  far?: number;
}

export type TransitionType =
  | 'none'
  | 'fog'
  | 'flash'
  | 'portal'
  | 'dissolve'
  | 'sand'
  | 'water'
  | 'petals'
  | 'clouds';

export interface TransitionSpec {
  type: TransitionType;
  /** Linear-space colour the transition resolves through. */
  color?: string;
  /** Screen-space focus point (0–1), e.g. a doorway for the portal. */
  center?: [number, number];
  /** Half-width of the transition in viewport heights of scroll. */
  width?: number;
}

export type WeatherState = 'clear' | 'rain' | 'monsoon' | 'snow' | 'fog' | 'sandstorm' | 'night' | 'sunset';

export type TimeOfDay = 'void' | 'predawn' | 'dawn' | 'morning' | 'noon' | 'golden' | 'dusk' | 'night';

export interface EnvironmentState {
  skyZenith: string;
  skyHorizon: string;
  groundColor: string;
  sunColor: string;
  sunIntensity: number;
  /** Degrees above the horizon. */
  sunElevation: number;
  /** Degrees, 0 = +Z (towards camera start), 90 = +X. */
  sunAzimuth: number;
  sunDiscSize: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogDensity: number;
  /** How strongly fog thickens near the ground (0 = uniform). */
  fogHeight: number;
  exposure: number;
  bloom: number;
  stars: number;
  clouds: number;
  cloudColor: string;
  saturation: number;
  contrast: number;
  vignette: number;
  grain: number;
  /** Warm (+) / cool (−) split-tone grade. */
  warmth: number;
  wind: number;
  wetness: number;
  heatHaze: number;
}

export type EnvironmentPresetId = string;

export interface EnvironmentKey {
  t: number;
  preset: EnvironmentPresetId;
  overrides?: Partial<EnvironmentState>;
}

export type ParticlePresetId =
  | 'dust'
  | 'snow'
  | 'rain'
  | 'embers'
  | 'petals'
  | 'leaves'
  | 'sparks'
  | 'mist'
  | 'fireflies'
  | 'stars'
  | 'sand'
  | 'spray'
  | 'pollen'
  | 'colour';

export interface ParticleLayerSpec {
  preset: ParticlePresetId;
  intensity?: number;
  /** Local chapter window in which the layer is visible. */
  from?: number;
  to?: number;
}

export type AmbienceId =
  | 'wind'
  | 'high-wind'
  | 'river'
  | 'birds'
  | 'bells'
  | 'fire'
  | 'crowd'
  | 'forest'
  | 'waves'
  | 'rain'
  | 'desert'
  | 'festival'
  | 'kitchen'
  | 'city'
  | 'drone';

export interface DepthOfFieldKey {
  t: number;
  /** World-space focus distance from the camera. */
  focus: number;
  range: number;
  bokeh: number;
}

export interface ChapterScene {
  set: SetId;
  camera: CameraTrack;
  environment: EnvironmentKey[];
  weather: WeatherState;
  particles?: ParticleLayerSpec[];
  transitionIn: TransitionSpec;
  audio: AmbienceId[];
  depthOfField?: DepthOfFieldKey[];
  /** Screen position of the chapter's 3D-anchored stat label. */
  statAnchor?: Vec3;
  video?: string;
}
