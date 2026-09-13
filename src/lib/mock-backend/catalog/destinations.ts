import { destinations, getDestination, REGION_LABELS } from '@/data/destinations';
import { experiences } from '@/data/experiences';
import { dishes } from '@/data/food';
import { getDestinationPhotos, type Photo } from '@/data/media/photos';
import { getStill } from '@/data/media/stills';
import { getState } from '@/data/states';
import type { AttractionType, Destination } from '@/data/types';
import type {
  AttractionDto,
  DestinationCategory,
  DestinationDto,
  DestinationSummaryDto,
  ImageDto,
  Level3,
} from '@/types/api';

const SAMPLE_SAFETY_LABEL = 'TravIndi safety data (sample)';

export const EMERGENCY_NUMBERS = [
  { label: 'National emergency', number: '112' },
  { label: 'Ambulance', number: '108' },
  { label: 'Tourist helpline', number: '1363' },
];

function categoryFor(destination: Destination): DestinationCategory {
  const tags = destination.tags;
  switch (destination.scene) {
    case 'himalaya':
      return 'mountains';
    case 'ganga':
      return 'spiritual';
    case 'hampi':
    case 'taj':
    case 'temple':
    case 'festival':
      return 'heritage';
    case 'forest':
      return tags.includes('wildlife') ? 'wildlife' : 'nature';
    case 'coast':
      if (tags.includes('backwaters')) return 'backwaters';
      if (tags.includes('islands')) return 'islands';
      return 'beaches';
    case 'desert':
      return 'desert';
    case 'city':
      return 'city';
    default:
      return 'nature';
  }
}

function imageFor(still: string, alt: string): ImageDto | null {
  const asset = getStill(still);
  if (!asset) return null;
  return { url: asset.src, alt, width: asset.width, height: asset.height, blur_data_url: asset.blur ?? null, credit: null };
}

function photoImage(photo: Photo): ImageDto {
  return {
    url: photo.src,
    url_small: photo.src_small,
    alt: photo.alt,
    width: photo.width,
    height: photo.height,
    blur_data_url: null,
    credit: `${photo.author} · ${photo.licence} · Wikimedia Commons`,
    attribution: {
      author: photo.author,
      licence: photo.licence,
      licence_url: photo.licence_url,
      source_url: photo.source_url,
      source_name: 'Wikimedia Commons',
    },
  };
}

/** Real photography where it has been curated; otherwise the rendered scene still. */
function heroFor(destination: Destination): ImageDto | null {
  const photo = getDestinationPhotos(destination.slug)?.hero;
  return photo ? photoImage(photo) : imageFor(destination.still, destination.name);
}

const WALKING: Partial<Record<AttractionType, Level3>> = {
  fort: 'high',
  nature: 'high',
  market: 'high',
  waterfall: 'moderate',
  viewpoint: 'moderate',
  temple: 'moderate',
  museum: 'moderate',
  lake: 'low',
  'wildlife-reserve': 'low',
};

export function toDestinationSummary(destination: Destination, shortReason?: string | null): DestinationSummaryDto {
  return {
    destination_id: `dst_${destination.slug}`,
    slug: destination.slug,
    name: destination.name,
    state: getState(destination.state)?.name ?? destination.state,
    region: REGION_LABELS[destination.region],
    category: categoryFor(destination),
    tagline: destination.tagline,
    short_reason: shortReason ?? destination.highlights[0] ?? null,
    hero_image: heroFor(destination),
    coordinates: destination.coordinates,
    tags: destination.tags,
    current_signal: null,
  };
}

function toAttraction(destination: Destination, index: number): AttractionDto {
  const attraction = destination.attractions[index]!;
  const photo = getDestinationPhotos(destination.slug)?.attractions[attraction.slug];
  return {
    attraction_id: `atr_${attraction.slug}`,
    destination_id: `dst_${destination.slug}`,
    slug: attraction.slug,
    name: attraction.name,
    category: attraction.type.replace(/-/g, ' '),
    summary: attraction.summary,
    history: attraction.history,
    era: attraction.era ?? null,
    coordinates: attraction.coordinates,
    image: photo ? photoImage(photo) : null,
    typical_duration_minutes: null,
    opening_hours: null,
    // No authoritative ticket prices are held for attractions.
    entry_cost: { status: 'unavailable', value: null },
    accessibility: {
      step_free: null,
      walking_level: WALKING[attraction.type] ?? null,
      seating_available: null,
      notes: null,
    },
    photography_tips: attraction.photographyTips,
    unesco: Boolean(attraction.unesco),
  };
}

export function toDestinationDetail(destination: Destination, advisories: DestinationDto['safety']['advisories'] = []): DestinationDto {
  const high = destination.attractions.filter((a) => WALKING[a.type] === 'high').map((a) => a.name);
  const low = destination.attractions.filter((a) => WALKING[a.type] === 'low').map((a) => a.name);
  return {
    ...toDestinationSummary(destination),
    gallery: (getDestinationPhotos(destination.slug)?.gallery ?? []).map(photoImage),
    description: destination.description,
    why_visit: destination.highlights,
    best_time: { months: destination.bestTime.months, note: destination.bestTime.note },
    ideal_duration: { min_days: destination.idealDuration.minDays, max_days: destination.idealDuration.maxDays },
    getting_there: {
      air: destination.gettingThere.air ?? null,
      rail: destination.gettingThere.rail ?? null,
      road: destination.gettingThere.road ?? null,
    },
    permits: destination.permits ?? null,
    attractions: destination.attractions.map((_, i) => toAttraction(destination, i)),
    food: dishes
      .filter((dish) => dish.whereToTry.includes(destination.slug))
      .map((dish) => ({
        food_id: `food_${dish.slug}`,
        name: dish.name,
        description: dish.description,
        vegetarian: dish.vegetarian,
        where_to_try: [destination.name],
      })),
    experiences: experiences
      .filter((experience) => experience.destination === destination.slug)
      .map((experience) => ({
        experience_id: `exp_${experience.slug}`,
        name: experience.name,
        category: experience.category,
        summary: experience.summary,
        duration_label: experience.duration,
        best_months: experience.bestMonths,
      })),
    safety: {
      summary: advisories.length
        ? 'Check the current advisories below before heading out.'
        : 'No active advisories in TravIndi’s data for this destination.',
      advisories,
      emergency_numbers: EMERGENCY_NUMBERS,
      freshness: { source_kind: 'application', updated_at: new Date().toISOString(), source_label: SAMPLE_SAFETY_LABEL },
    },
    accessibility: {
      summary: high.length
        ? 'Some highlights involve steep climbs or long walks; gentler alternatives are listed.'
        : 'Most highlights can be visited with moderate walking.',
      step_free_highlights: low,
      considerations: high.map((name) => `${name} involves significant walking or steps.`),
    },
    // Live weather, crowd and transport feeds are not connected.
    conditions: { weather: null, crowd: null, transport: null },
  };
}

export function allDestinationSummaries() {
  return destinations.map((destination) => toDestinationSummary(destination));
}

export function destinationDetail(slug: string, advisories: DestinationDto['safety']['advisories'] = []) {
  const destination = getDestination(slug);
  return destination ? toDestinationDetail(destination, advisories) : null;
}
