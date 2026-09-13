import type { Transport } from '@/lib/api/transport';
import { type AdaptationRepository, createAdaptationRepository } from './adaptations';
import { type AuthRepository, createAuthRepository } from './auth';
import { type AuthorityRepository, createAuthorityRepository } from './authority';
import { type BookingRepository, createBookingRepository } from './bookings';
import { type ChatRepository, createChatRepository } from './chat';
import { createRepositoryClient } from './client';
import { createDestinationRepository, type DestinationRepository } from './destinations';
import { createItineraryRepository, type ItineraryRepository } from './itineraries';
import { createLocationRepository, type LocationRepository } from './location';
import { createMapRepository, type MapRepository } from './maps';
import { createNotificationRepository, type NotificationRepository } from './notifications';
import { createPartnerRepository, type PartnerRepository } from './partner';
import { createPlatformRepository, type PlatformRepository } from './platform';
import { createProfileRepository, type ProfileRepository } from './profile';
import {
  type BusinessRepository,
  createBusinessRepository,
  createGuideRepository,
  createTrustRepository,
  type GuideRepository,
  type TrustRepository,
} from './providers';
import { createSafetyRepository, createSosRepository, type SafetyRepository, type SosRepository } from './safety';
import { createTripRepository, type TripRepository } from './trips';

/**
 * The complete frontend ⇄ backend surface. Everything the UI can ask of the
 * backend is listed here, grouped by domain.
 */
export interface Repositories {
  platform: PlatformRepository;
  auth: AuthRepository;
  profile: ProfileRepository;
  destinations: DestinationRepository;
  trips: TripRepository;
  itineraries: ItineraryRepository;
  adaptations: AdaptationRepository;
  maps: MapRepository;
  safety: SafetyRepository;
  sos: SosRepository;
  location: LocationRepository;
  chat: ChatRepository;
  bookings: BookingRepository;
  businesses: BusinessRepository;
  guides: GuideRepository;
  trust: TrustRepository;
  notifications: NotificationRepository;
  authority: AuthorityRepository;
  partner: PartnerRepository;
}

export function createRepositories(transport: Transport): Repositories {
  const client = createRepositoryClient(transport);
  return {
    platform: createPlatformRepository(client),
    auth: createAuthRepository(client),
    profile: createProfileRepository(client),
    destinations: createDestinationRepository(client),
    trips: createTripRepository(client),
    itineraries: createItineraryRepository(client),
    adaptations: createAdaptationRepository(client),
    maps: createMapRepository(client),
    safety: createSafetyRepository(client),
    sos: createSosRepository(client),
    location: createLocationRepository(client),
    chat: createChatRepository(client),
    bookings: createBookingRepository(client),
    businesses: createBusinessRepository(client),
    guides: createGuideRepository(client),
    trust: createTrustRepository(client),
    notifications: createNotificationRepository(client),
    authority: createAuthorityRepository(client),
    partner: createPartnerRepository(client),
  };
}

export type {
  AdaptationRepository,
  AuthorityRepository,
  AuthRepository,
  BookingRepository,
  BusinessRepository,
  ChatRepository,
  DestinationRepository,
  GuideRepository,
  ItineraryRepository,
  LocationRepository,
  MapRepository,
  NotificationRepository,
  PartnerRepository,
  PlatformRepository,
  ProfileRepository,
  SafetyRepository,
  SosRepository,
  TripRepository,
  TrustRepository,
};
