import type { QualityLevel } from '@/3d/core/quality';
import { chapters } from '@/data/journey';
import type { GeoPoint } from '@/data/types';
import { hasSet } from './registry';
import { createLiteTrack, indiaBeginningTrack, indiaIntroTrack, indiaPlanTrack } from './sets/india/tracks';
import type { CameraTrack, ChapterId, ChapterScene, EnvironmentKey, SetId } from './types';

/**
 * The scroll timeline. Each chapter declares its world, camera, lighting,
 * weather, particles, sound and how it is entered. Start/end positions are
 * derived from chapter lengths in `data/journey.ts`, so reordering or adding
 * chapters is purely a data change.
 */
interface ChapterSceneConfig extends Omit<ChapterScene, 'camera'> {
  /** Full-set camera. Omitted while a chapter uses the map flyover. */
  camera?: CameraTrack;
  /** Region the lightweight India flyover visits for this chapter. */
  focus: GeoPoint;
}

const configs: Record<ChapterId, ChapterSceneConfig> = {
  beginning: {
    set: 'india',
    focus: { lat: 20.6, lng: 78.9 },
    camera: indiaBeginningTrack,
    environment: [
      { t: 0, preset: 'india-sunrise' },
      { t: 1, preset: 'india-morning' },
    ],
    weather: 'clear',
    particles: [{ preset: 'dust', intensity: 0.35 }],
    transitionIn: { type: 'none' },
    audio: ['wind', 'drone'],
  },
  mountains: {
    set: 'himalaya',
    focus: { lat: 30.9, lng: 78.9 },
    environment: [
      { t: 0, preset: 'himalaya-dawn' },
      { t: 1, preset: 'himalaya-valley' },
    ],
    weather: 'snow',
    particles: [{ preset: 'snow', intensity: 0.7 }],
    transitionIn: { type: 'clouds', width: 0.5 },
    audio: ['high-wind', 'birds'],
  },
  rivers: {
    set: 'ganga',
    focus: { lat: 25.31, lng: 83.01 },
    environment: [{ t: 0, preset: 'ganga-dawn' }],
    weather: 'clear',
    particles: [{ preset: 'petals', intensity: 0.7 }],
    transitionIn: { type: 'petals', width: 0.45 },
    audio: ['river', 'bells', 'birds'],
  },
  kingdoms: {
    set: 'hampi',
    focus: { lat: 15.33, lng: 76.46 },
    environment: [{ t: 0, preset: 'hampi-morning' }],
    weather: 'fog',
    particles: [{ preset: 'dust', intensity: 0.6 }],
    transitionIn: { type: 'fog', width: 0.45 },
    audio: ['wind', 'river', 'birds'],
  },
  temples: {
    set: 'temple',
    focus: { lat: 9.92, lng: 78.12 },
    environment: [
      { t: 0, preset: 'temple-dusk' },
      { t: 0.78, preset: 'temple-dusk' },
      { t: 1, preset: 'temple-sky' },
    ],
    weather: 'clear',
    particles: [
      { preset: 'dust', intensity: 0.8 },
      { preset: 'embers', intensity: 0.25 },
    ],
    transitionIn: { type: 'flash', color: '#ffe2b0', width: 0.4 },
    audio: ['bells', 'crowd'],
  },
  empires: {
    set: 'battlefield',
    focus: { lat: 16.47, lng: 76.31 },
    environment: [{ t: 0, preset: 'battle-dawn' }],
    weather: 'sandstorm',
    particles: [
      { preset: 'dust', intensity: 1 },
      { preset: 'embers', intensity: 0.6 },
    ],
    transitionIn: { type: 'portal', width: 0.45 },
    audio: ['wind', 'fire', 'drone'],
  },
  monuments: {
    set: 'taj',
    focus: { lat: 27.17, lng: 78.04 },
    environment: [{ t: 0, preset: 'taj-sunrise' }],
    weather: 'clear',
    particles: [{ preset: 'pollen', intensity: 0.4 }],
    transitionIn: { type: 'dissolve', color: '#f2e6da', width: 0.45 },
    audio: ['birds', 'wind'],
  },
  forests: {
    set: 'forest',
    focus: { lat: 22.33, lng: 80.61 },
    environment: [{ t: 0, preset: 'forest-light' }],
    weather: 'clear',
    particles: [
      { preset: 'pollen', intensity: 0.8 },
      { preset: 'fireflies', from: 0.6, to: 1 },
    ],
    transitionIn: { type: 'water', color: '#cfe6e4', width: 0.45 },
    audio: ['forest', 'birds'],
  },
  coast: {
    set: 'coast',
    focus: { lat: 9.5, lng: 76.34 },
    environment: [
      { t: 0, preset: 'coast-monsoon' },
      { t: 0.62, preset: 'coast-monsoon' },
      { t: 1, preset: 'coast-golden' },
    ],
    weather: 'monsoon',
    particles: [{ preset: 'rain', from: 0, to: 0.7 }],
    transitionIn: { type: 'water', width: 0.45 },
    audio: ['rain', 'waves'],
  },
  desert: {
    set: 'desert',
    focus: { lat: 26.91, lng: 70.91 },
    environment: [{ t: 0, preset: 'desert-sunset' }],
    weather: 'sunset',
    particles: [{ preset: 'sand', intensity: 0.8 }],
    transitionIn: { type: 'sand', width: 0.5 },
    audio: ['desert', 'fire'],
  },
  festivals: {
    set: 'festival',
    focus: { lat: 22.57, lng: 88.36 },
    environment: [{ t: 0, preset: 'festival-night' }],
    weather: 'night',
    particles: [
      { preset: 'sparks', intensity: 0.8 },
      { preset: 'colour', from: 0.45, to: 0.9 },
    ],
    transitionIn: { type: 'dissolve', color: '#0a0610', width: 0.45 },
    audio: ['festival', 'crowd'],
  },
  food: {
    set: 'food',
    focus: { lat: 17.39, lng: 78.49 },
    environment: [{ t: 0, preset: 'food-studio' }],
    weather: 'clear',
    particles: [],
    transitionIn: { type: 'fog', color: '#0b0806', width: 0.4 },
    audio: ['kitchen'],
  },
  city: {
    set: 'city',
    focus: { lat: 19.0, lng: 72.84 },
    environment: [
      { t: 0, preset: 'india-night' },
      { t: 0.35, preset: 'city-night' },
    ],
    weather: 'night',
    particles: [],
    transitionIn: { type: 'flash', color: '#9fb4ff', width: 0.4 },
    audio: ['city', 'drone'],
  },
  hidden: {
    set: 'meghalaya',
    focus: { lat: 25.25, lng: 91.68 },
    environment: [{ t: 0, preset: 'meghalaya-mist' }],
    weather: 'fog',
    particles: [{ preset: 'mist', intensity: 0.8 }],
    transitionIn: { type: 'clouds', color: '#dfe6e2', width: 0.5 },
    audio: ['forest', 'river', 'rain'],
  },
  plan: {
    set: 'india',
    focus: { lat: 21, lng: 79 },
    camera: indiaPlanTrack,
    environment: [
      { t: 0, preset: 'india-dusk' },
      { t: 1, preset: 'india-dusk', overrides: { stars: 0.8 } },
    ],
    weather: 'sunset',
    particles: [],
    transitionIn: { type: 'fog', color: '#e3a07a', width: 0.5 },
    audio: ['wind', 'drone'],
  },
};

export const introTrack: CameraTrack = indiaIntroTrack;

/** Lighting of the auto-played intro: darkness → a star → sunrise over India. */
export const introEnvironment: EnvironmentKey[] = [
  { t: 0, preset: 'void' },
  { t: 0.3, preset: 'void', overrides: { stars: 0.85 } },
  { t: 0.55, preset: 'predawn' },
  { t: 1, preset: 'india-sunrise' },
];

const liteTracks: CameraTrack[] = chapters.map((chapter, i) => {
  const config = configs[chapter.id];
  if (config.set === 'india' && config.camera) return config.camera;
  const previous = i > 0 ? configs[chapters[i - 1]!.id].focus : null;
  return createLiteTrack(config.focus, previous);
});

export const journeyScenes: ChapterScene[] = chapters.map((chapter, i) => {
  const { focus: _focus, camera, ...scene } = configs[chapter.id];
  return { ...scene, camera: camera ?? liteTracks[i]! };
});

export interface EffectiveScene {
  set: SetId;
  camera: CameraTrack;
  /** True when the chapter is shown as a flyover of the India relief. */
  lite: boolean;
}

const effectiveCache = new Map<QualityLevel, EffectiveScene[]>();

/**
 * Resolves what actually renders for each chapter at a quality level: the
 * full set when available (and affordable), otherwise the map flyover.
 */
export function getEffectiveScenes(level: QualityLevel): EffectiveScene[] {
  let scenes = effectiveCache.get(level);
  if (!scenes) {
    scenes = journeyScenes.map((scene, i) => {
      const full = hasSet(scene.set) && (level !== 'low' || scene.set === 'india');
      return full
        ? { set: scene.set, camera: scene.camera, lite: false }
        : { set: 'india', camera: liteTracks[i]!, lite: true };
    });
    effectiveCache.set(level, scenes);
  }
  return scenes;
}
