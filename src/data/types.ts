/**
 * Content model for the platform. Everything the UI renders — copy, places,
 * coordinates, media references, scene choices — is described by these types
 * so new destinations can be added without touching components.
 */

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type RegionId = 'north' | 'west' | 'south' | 'east' | 'northeast' | 'central' | 'islands';

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Visual worlds the 3D engine can render. Also used to key imagery. */
export type SceneThemeId =
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

export type DestinationTag =
  | 'mountains'
  | 'beaches'
  | 'heritage'
  | 'history'
  | 'temples'
  | 'forts'
  | 'palaces'
  | 'wildlife'
  | 'backwaters'
  | 'desert'
  | 'spiritual'
  | 'food'
  | 'adventure'
  | 'nature'
  | 'culture'
  | 'city'
  | 'unesco'
  | 'lakes'
  | 'waterfalls'
  | 'hill-station'
  | 'trekking'
  | 'islands'
  | 'architecture'
  | 'festivals'
  | 'nightlife'
  | 'wellness'
  | 'rivers';

export type AttractionType =
  | 'monument'
  | 'temple'
  | 'fort'
  | 'palace'
  | 'nature'
  | 'museum'
  | 'market'
  | 'lake'
  | 'beach'
  | 'viewpoint'
  | 'religious-site'
  | 'wildlife-reserve'
  | 'waterfall'
  | 'cave'
  | 'neighbourhood'
  | 'experience';

export interface Attraction {
  slug: string;
  name: string;
  type: AttractionType;
  /** Short dating line, e.g. "Built 1632–1653". */
  era?: string;
  summary: string;
  history: string;
  bestTime: string;
  photographyTips: string[];
  coordinates: GeoPoint;
  /** Key into the 3D model manifest. */
  modelId?: string;
  unesco?: boolean;
}

export interface Destination {
  slug: string;
  name: string;
  /** State or union territory slug. */
  state: string;
  region: RegionId;
  coordinates: GeoPoint;
  tagline: string;
  /** ~155 characters; used for meta descriptions and cards. */
  summary: string;
  description: string[];
  tags: DestinationTag[];
  highlights: string[];
  attractions: Attraction[];
  experiences: string[];
  bestTime: { months: Month[]; note: string };
  idealDuration: { minDays: number; maxDays: number };
  gettingThere: { air?: string; rail?: string; road?: string };
  scene: SceneThemeId;
  /** Key into the imagery manifest. */
  still: string;
  accent: string;
  /** 0–100; drives ordering of "popular" lists. */
  popularity: number;
  hiddenGem?: boolean;
  videoId?: string;
  permits?: string;
}

export interface StatePillars {
  culture: string;
  food: string;
  architecture: string;
  nature: string;
  festivals: string;
  history: string;
}

export interface StateProfile {
  slug: string;
  name: string;
  /** Location ids in the India SVG map covered by this profile. */
  mapIds: string[];
  kind: 'state' | 'union-territory';
  capital: string;
  region: RegionId;
  tagline?: string;
  intro?: string;
  pillars?: StatePillars;
  sceneTheme?: SceneThemeId;
  accent?: string;
  featured?: boolean;
}

export type ExperienceCategory =
  | 'adventure'
  | 'culture'
  | 'spiritual'
  | 'wildlife'
  | 'food'
  | 'wellness'
  | 'festival'
  | 'nature';

export interface Experience {
  slug: string;
  name: string;
  category: ExperienceCategory;
  destination: string;
  summary: string;
  duration: string;
  bestMonths: Month[];
  tags: DestinationTag[];
  still: string;
}

export interface ItineraryStop {
  destination: string;
  nights: number;
  highlights: string[];
}

export interface Itinerary {
  slug: string;
  name: string;
  /** Destination slug or gateway city slug the trip starts from. */
  origin: string;
  days: number;
  summary: string;
  stops: ItineraryStop[];
  bestMonths: Month[];
  tags: DestinationTag[];
  pace: 'relaxed' | 'balanced' | 'active';
  still: string;
}

export type DishArchetype =
  | 'biryani'
  | 'dosa'
  | 'idli'
  | 'thali'
  | 'rasgulla'
  | 'misal-pav'
  | 'pani-puri'
  | 'butter-chicken'
  | 'jalebi'
  | 'samosa';

export interface Dish {
  slug: string;
  name: string;
  localName?: string;
  region: string;
  description: string;
  tasteNotes: string[];
  whereToTry: string[];
  vegetarian: boolean;
  archetype: DishArchetype;
  accent: string;
}

export interface FestivalEvent {
  slug: string;
  name: string;
  months: Month[];
  where: string;
  destinations: string[];
  summary: string;
  category: 'religious' | 'cultural' | 'music' | 'harvest' | 'fair' | 'arts';
}

export interface TravelGuide {
  slug: string;
  title: string;
  summary: string;
  readingMinutes: number;
  tags: DestinationTag[];
  destinations: string[];
  still: string;
  sections: { heading: string; body: string }[];
}

export interface GatewayCity {
  slug: string;
  name: string;
  state: string;
  coordinates: GeoPoint;
}
