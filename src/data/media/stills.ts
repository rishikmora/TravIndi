import generated from '@/data/generated/stills.json';
import type { ChapterId } from '@/scenes/types';
import type { SceneThemeId } from '../types';

export interface StillAsset {
  src: string;
  width: number;
  height: number;
  /** Tiny base64 preview for progressive loading. */
  blur?: string;
}

/**
 * Stills are frames rendered from the 3D engine itself (see
 * `scripts/capture` and `/dev/capture`). Production photography can replace
 * any entry by id without touching components.
 */
const stills = generated as Record<string, StillAsset>;

export function getStill(id: string): StillAsset | undefined {
  return stills[id];
}

export function themeOfStill(id: string): SceneThemeId {
  return id.split('-')[0] as SceneThemeId;
}

/** Representative frame for each chapter, used by the static journey. */
export const CHAPTER_STILLS: Record<ChapterId, string> = {
  beginning: 'india-01',
  mountains: 'himalaya-01',
  rivers: 'ganga-01',
  kingdoms: 'hampi-01',
  temples: 'temple-01',
  empires: 'battlefield-01',
  monuments: 'taj-01',
  forests: 'forest-01',
  coast: 'coast-01',
  desert: 'desert-01',
  festivals: 'festival-01',
  food: 'food-01',
  city: 'city-01',
  hidden: 'meghalaya-01',
  plan: 'india-02',
};
