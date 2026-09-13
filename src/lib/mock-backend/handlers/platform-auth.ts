import { destinations } from '@/data/destinations';
import type {
  CapabilitiesDto,
  ConsentDto,
  DataRequestDto,
  HomeSummaryDto,
  NotificationPreferencesDto,
  PlatformMetricsDto,
  ProfileDto,
  SessionDto,
  UserDto,
} from '@/types/api';
import { findPlace } from '../catalog/places';
import { created, fail, newId, noContent, nowIso, ok } from '../http';
import { route, type RouteDefinition } from '../router';
import { consentsFor, defaultProfile } from '../seed/users';
import type { MockStore, UserRecord } from '../store';
import { readString, strip, tripForViewer, validationFailed } from './shared';

/** What this development backend actually implements. */
export const MOCK_CAPABILITIES: CapabilitiesDto = {
  live_crowd: false,
  weather: false,
  transport: false,
  push: false,
  payment: false,
  auto_adaptation: true,
  turn_by_turn: false,
  sms: false,
  offline_message_queue: false,
  authority_integration: false,
  community: true,
  gamification: false,
  bookings: true,
  location_sharing: true,
};

const publicUser = (user: UserRecord): UserDto => strip(user);

const sessionFor = (store: MockStore, user: UserRecord): SessionDto => ({
  user: publicUser(user),
  access_token: null,
  expires_at: store.sessionExpiresAt ?? nowIso(),
});

const failedLogins = new Map<string, number[]>();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORTED_CHANNELS: Array<NotificationPreferencesDto['channels'][number]> = ['in_app', 'email'];

export const platformAuthRoutes: RouteDefinition[] = [
  route('GET', '/v1/capabilities', () => ok(MOCK_CAPABILITIES)),

  route('GET', '/v1/metrics/platform', () => {
    // Only counts the frontend can substantiate; fixture providers are sample data, so they are not counted.
    const metrics: PlatformMetricsDto = {
      destinations_count: destinations.length,
      verified_providers_count: null,
      trips_planned_count: null,
      planner_available: true,
      as_of: nowIso(),
    };
    return ok(metrics);
  }),

  route('GET', '/v1/auth/session', ({ store, requireUser }) => {
    const user = requireUser();
    return ok(sessionFor(store, store.user(user.user_id)!));
  }),

  route('POST', '/v1/auth/login', ({ store, body }) => {
    const email = readString(body, 'email', { required: true, max: 254, label: 'Email' })!.toLowerCase();
    const password = readString(body, 'password', { required: true, max: 200, label: 'Password' })!;
    const recent = (failedLogins.get(email) ?? []).filter((t) => Date.now() - t < 5 * 60_000);
    if (recent.length >= 5) {
      fail(429, 'too_many_attempts', 'Too many sign-in attempts. Please wait a minute and try again.', { retry_after_seconds: 60 });
    }
    const user = store.state.users.find((u) => u.email.toLowerCase() === email);
    if (!user || user._password !== body.password) {
      failedLogins.set(email, [...recent, Date.now()]);
      fail(401, 'invalid_credentials', 'That email and password don’t match.');
    }
    failedLogins.delete(email);
    void password;
    store.startSession(user.user_id);
    return ok(sessionFor(store, user));
  }),

  route('POST', '/v1/auth/register', ({ store, body }) => {
    const email = readString(body, 'email', { required: true, max: 254, label: 'Email' })!.toLowerCase();
    const displayName = readString(body, 'display_name', { required: true, min: 2, max: 60, label: 'Name' })!;
    const password = typeof body.password === 'string' ? body.password : '';
    const issues: Array<{ field: string; issue: string }> = [];
    if (!EMAIL.test(email)) issues.push({ field: 'email', issue: 'Enter a valid email address.' });
    if (password.length < 8) issues.push({ field: 'password', issue: 'Use at least 8 characters.' });
    if (body.accept_terms !== true) issues.push({ field: 'accept_terms', issue: 'Accept the terms to create an account.' });
    if (issues.length) validationFailed(issues);
    if (store.state.users.some((u) => u.email.toLowerCase() === email)) {
      fail(409, 'email_taken', 'An account with this email already exists. Try signing in instead.');
    }

    const user: UserRecord = {
      user_id: newId('usr'),
      email,
      display_name: displayName,
      avatar_url: null,
      roles: ['traveller'],
      locale: 'en-IN',
      created_at: nowIso(),
      _password: password,
      _provider_id: null,
    };
    const choices = Array.isArray(body.consents) ? (body.consents as Array<{ consent_id?: string; granted?: boolean }>) : [];
    store.state.users.push(user);
    store.state.profiles[user.user_id] = defaultProfile(user);
    store.state.consents[user.user_id] = consentsFor(
      choices.filter((c) => c.granted && typeof c.consent_id === 'string').map((c) => c.consent_id!),
      user.created_at,
    );
    store.startSession(user.user_id);
    store.persist();
    return created(sessionFor(store, user));
  }),

  route('POST', '/v1/auth/logout', ({ store, hub }) => {
    store.endSession();
    hub.disconnectAll(4401, 'signed out');
    return noContent();
  }),

  route('POST', '/v1/auth/refresh', ({ store }) => {
    const user = store.sessionUser;
    if (!user) fail(401, 'session_expired', 'Your session has ended. Please sign in again.');
    store.startSession(user.user_id);
    return ok(sessionFor(store, user));
  }),

  route('GET', '/v1/me/profile', ({ store, requireUser }) => ok(store.state.profiles[requireUser().user_id])),

  route('PATCH', '/v1/me/profile', ({ store, body, requireUser }) => {
    const user = requireUser();
    const current = store.state.profiles[user.user_id]!;
    const next: ProfileDto = { ...current };

    if ('display_name' in body) next.display_name = readString(body, 'display_name', { required: true, min: 2, max: 60, label: 'Name' })!;
    if ('home_city' in body) next.home_city = readString(body, 'home_city', { max: 80, label: 'Home city' });
    if ('languages' in body) {
      const languages = body.languages;
      if (!Array.isArray(languages) || languages.length > 10 || languages.some((l) => typeof l !== 'string' || l.length > 40)) {
        validationFailed([{ field: 'languages', issue: 'Choose up to 10 languages.' }]);
      }
      next.languages = languages as string[];
    }
    if (body.travel_preferences && typeof body.travel_preferences === 'object') {
      next.travel_preferences = { ...current.travel_preferences, ...(body.travel_preferences as object) };
    }
    if (body.accessibility && typeof body.accessibility === 'object') {
      next.accessibility = { ...current.accessibility, ...(body.accessibility as object) };
    }
    if (body.safety_preferences && typeof body.safety_preferences === 'object') {
      next.safety_preferences = { ...current.safety_preferences, ...(body.safety_preferences as object) };
    }
    if (body.notification_preferences && typeof body.notification_preferences === 'object') {
      const prefs = { ...current.notification_preferences, ...(body.notification_preferences as object) } as NotificationPreferencesDto;
      const unsupported = prefs.channels.filter((c) => !SUPPORTED_CHANNELS.includes(c));
      if (unsupported.length) {
        validationFailed(
          [{ field: 'notification_preferences.channels', issue: `${unsupported.join(', ')} notifications aren’t available yet.` }],
          'Some notification channels aren’t available yet.',
        );
      }
      next.notification_preferences = prefs;
    }

    next.updated_at = nowIso();
    store.state.profiles[user.user_id] = next;
    const record = store.user(user.user_id);
    if (record) record.display_name = next.display_name;
    store.persist();
    return ok(next);
  }),

  route('GET', '/v1/me/home', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    const today = new Date().toISOString().slice(0, 10);
    const trips = store.tripsFor(userId).map((trip) => tripForViewer(store, trip, userId));
    const upcoming =
      trips.find((t) => t.status === 'active') ??
      trips
        .filter((t) => (t.status === 'ready' || t.status === 'planning') && (!t.end_date || t.end_date >= today))
        .sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'))[0] ??
      null;
    const draft = trips.filter((t) => t.status === 'draft').sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;

    const home: HomeSummaryDto = {
      upcoming_trip: upcoming,
      draft_trip: draft,
      recent_destination: upcoming?.destination ?? draft?.destination ?? null,
      unread_trip_messages: trips.reduce((sum, t) => sum + t.unread_messages, 0),
      pending_adaptations: store.state.proposals
        .filter((p) => p.status === 'proposed')
        .flatMap((p) => {
          const trip = trips.find((t) => t.trip_id === p.trip_id);
          return trip?.permissions.can_review_adaptations
            ? [{ trip_id: p.trip_id, proposal_id: p.proposal_id, summary: p.summary, trip_title: trip.title }]
            : [];
        }),
      saved_places: (store.state.saved_places[userId] ?? []).flatMap((placeId) => {
        const place = findPlace(placeId);
        return place ? [{ place_id: place.place_id, name: place.name, destination_slug: place.destination_slug, image: null }] : [];
      }),
    };
    return ok(home);
  }),

  route('GET', '/v1/me/consents', ({ store, requireUser }) => ok({ items: store.state.consents[requireUser().user_id] ?? [] })),

  route('PUT', '/v1/me/consents/:consentId', ({ store, hub, params, body, requireUser }) => {
    const userId = requireUser().user_id;
    const consents = store.state.consents[userId] ?? [];
    const consent = consents.find((c) => c.consent_id === params.consentId);
    if (!consent) fail(404, 'consent_not_found', 'That consent option doesn’t exist.');
    if (typeof body.granted !== 'boolean') validationFailed([{ field: 'granted', issue: 'Choose allow or don’t allow.' }]);
    if (consent.required && !body.granted) {
      fail(422, 'consent_required', 'This consent is required to use TravIndi. To withdraw it, request account deletion.');
    }
    const updated: ConsentDto = { ...consent, granted: body.granted, updated_at: nowIso() };
    store.state.consents[userId] = consents.map((c) => (c.consent_id === consent.consent_id ? updated : c));

    // Withdrawing location consent ends every active share immediately, server-side.
    if (consent.consent_id === 'location_sharing' && !body.granted) {
      for (const share of store.state.shares) {
        if (share.owner_id !== userId || (share.status !== 'active' && share.status !== 'paused')) continue;
        share.status = 'revoked';
        share._ended_at = nowIso();
        share.last_location = null;
        share.last_location_at = null;
        hub.publish(`location_share:${share.share_id}`, 'location.revoked', { share_id: share.share_id, revoked_at: share._ended_at, revoked_by: 'system' });
        hub.revalidate(`location_share:${share.share_id}`);
      }
    }
    store.persist();
    return ok(updated);
  }),

  route('GET', '/v1/me/data-requests', ({ store, requireUser }) => ok({ items: store.state.data_requests[requireUser().user_id] ?? [] })),

  route('POST', '/v1/me/data-requests', ({ store, body, requireUser }) => {
    const userId = requireUser().user_id;
    if (body.kind !== 'export' && body.kind !== 'deletion') validationFailed([{ field: 'kind', issue: 'Choose export or deletion.' }]);
    const existing = store.state.data_requests[userId] ?? [];
    if (existing.some((r) => r.kind === body.kind && (r.status === 'received' || r.status === 'processing'))) {
      fail(409, 'request_exists', 'You already have a request of this kind in progress.');
    }
    const request: DataRequestDto = { request_id: newId('dr'), kind: body.kind, status: 'received', created_at: nowIso(), download_url: null };
    store.state.data_requests[userId] = [request, ...existing];
    store.persist();
    return created(request);
  }),
];
