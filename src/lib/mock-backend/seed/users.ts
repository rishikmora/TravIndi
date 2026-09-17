import type { ConsentDto, ProfileDto, UserDto } from '@/types/api';
import type { UserRecord } from '../store';
import { DEMO_PASSWORD, minutesAgo, U } from './ids';

const user = (
  user_id: string,
  email: string,
  display_name: string,
  roles: UserDto['roles'],
  provider: string | null = null,
  daysAgo = 200,
): UserRecord => ({
  user_id,
  email,
  display_name,
  avatar_url: null,
  roles,
  locale: 'en-IN',
  created_at: minutesAgo(daysAgo * 1440),
  _password: DEMO_PASSWORD,
  _provider_id: provider,
});

export function seedUsers(): UserRecord[] {
  return [
    user(U.ananya, 'demo@travindi.dev', 'Ananya Rao', ['traveller']),
    user(U.rahul, 'rahul@travindi.dev', 'Rahul Rao', ['traveller']),
    user(U.appa, 'srinivas@travindi.dev', 'Srinivas Rao', ['traveller']),
    user(U.amma, 'meera@travindi.dev', 'Meera Rao', ['traveller']),
    user(U.priya, 'priya@travindi.dev', 'Priya Shah', ['traveller']),
    user(U.ops, 'operations@travindi.dev', 'Operations Desk (demo)', ['authority']),
    user(U.farhan, 'farhan@travindi.dev', 'Farhan Ali', ['guide'], 'gd_farhan_ali'),
    user(U.oldcity, 'oldcity@travindi.dev', 'Old City Heritage Walks', ['business'], 'biz_oldcity_walks'),
  ];
}

export function defaultProfile(user: UserDto): ProfileDto {
  return {
    user_id: user.user_id,
    display_name: user.display_name,
    email: user.email,
    phone_masked: null,
    home_city: null,
    languages: ['English'],
    preferred_language: null,
    travel_preferences: { pace: null, interests: [], food: null, transport: [], accommodation: null },
    accessibility: {
      low_walking: false,
      wheelchair: false,
      step_free_access: false,
      hearing_support: false,
      visual_support: false,
      notes: null,
    },
    safety_preferences: { preference: 'standard', check_in_reminders: false, default_share_duration_minutes: 60 },
    notification_preferences: {
      safety: true,
      trips: true,
      messages: true,
      bookings: true,
      community: false,
      channels: ['in_app'],
    },
    updated_at: user.created_at,
  };
}

export const CONSENT_CATALOG: Array<Omit<ConsentDto, 'granted' | 'updated_at'>> = [
  { consent_id: 'terms', title: 'Terms of use', description: 'Required to use TravIndi.', required: true },
  {
    consent_id: 'location_sharing',
    title: 'Location sharing',
    description: 'Lets you share your live location with people you choose. Nothing is shared until you start a share.',
    required: false,
  },
  {
    consent_id: 'personalisation',
    title: 'Personalised planning',
    description: 'Use your saved preferences to tailor itineraries.',
    required: false,
  },
  {
    consent_id: 'product_analytics',
    title: 'Product analytics',
    description: 'Usage data without personal details, used to improve TravIndi.',
    required: false,
  },
  {
    consent_id: 'marketing',
    title: 'Travel inspiration',
    description: 'Occasional messages about destinations and seasonal ideas.',
    required: false,
  },
];

export function consentsFor(granted: string[], updatedAt: string | null): ConsentDto[] {
  return CONSENT_CATALOG.map((consent) => ({
    ...consent,
    granted: consent.required || granted.includes(consent.consent_id),
    updated_at: updatedAt,
  }));
}

export function seedProfiles(users: UserRecord[]): Record<string, ProfileDto> {
  const profiles = Object.fromEntries(users.map((u) => [u.user_id, defaultProfile(u)]));
  const ananya = profiles[U.ananya]!;
  profiles[U.ananya] = {
    ...ananya,
    phone_masked: '+91 ••••• ••321',
    home_city: 'Bengaluru',
    languages: ['English', 'Telugu', 'Hindi'],
    travel_preferences: {
      pace: 'relaxed',
      interests: ['heritage', 'food', 'temples'],
      food: { diet: 'no_preference', spice_tolerance: 'medium', allergies: [], interests: ['regional specialities'] },
      transport: ['taxi', 'train'],
      accommodation: 'mid_range',
    },
    safety_preferences: { preference: 'high', check_in_reminders: true, default_share_duration_minutes: 120 },
  };
  profiles[U.amma] = {
    ...profiles[U.amma]!,
    languages: ['Telugu', 'English'],
    accessibility: { ...profiles[U.amma]!.accessibility, low_walking: true, notes: 'Needs regular places to sit.' },
  };
  return profiles;
}

export function seedConsents(users: UserRecord[]): Record<string, ConsentDto[]> {
  return Object.fromEntries(
    users.map((u) => [
      u.user_id,
      consentsFor(['location_sharing', 'personalisation', 'product_analytics'], u.created_at),
    ]),
  );
}
