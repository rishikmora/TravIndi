import { destinations, getDestination } from '@/data/destinations';
import type {
  AcceptAdaptationResponseDto,
  AdaptationProposalDto,
  GenerationStage,
  MapLayerId,
  ReplanPreset,
  TripDto,
  TripIntentInputDto,
} from '@/types/api';
import { toDestinationSummary } from '../catalog/destinations';
import { maybeAutoplayAdaptation } from '../effects';
import { mockFlags } from '../flags';
import { created, fail, newId, nowIso, ok } from '../http';
import { applyPayload, buildReplanProposal } from '../logic/adaptation';
import { extractIntent } from '../logic/intent';
import { buildItinerary } from '../logic/itinerary';
import { withBookingStatus } from '../logic/offers';
import { mapLayers, planRoutes } from '../logic/routes';
import type { RealtimeHub } from '../realtime';
import { route, type HandlerContext, type RouteDefinition } from '../router';
import type { ConversationRecord, JobRecord, MockStore } from '../store';
import {
  csv,
  idempotent,
  notify,
  permissionsFor,
  readString,
  requireTripMember,
  strip,
  tripForViewer,
  tripSummary,
  validationFailed,
} from './shared';

const STAGES: GenerationStage[] = [
  'understanding_trip',
  'checking_destination',
  'finding_places',
  'checking_preferences',
  'building_itinerary',
  'validating_journey',
];
const STAGE_MS = 1100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRESETS: ReplanPreset[] = ['cheaper', 'more_relaxed', 'more_heritage', 'more_food', 'less_walking', 'avoid_crowds', 'improve_safety'];
const LAYERS: MapLayerId[] = ['route', 'safety', 'crowd', 'accessibility', 'places', 'people', 'location'];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveDestination(intent: TripIntentInputDto) {
  const bySlug = intent.destination_id ? getDestination(intent.destination_id.replace(/^dst_/, '')) : undefined;
  if (bySlug) return bySlug;
  const name = intent.destination?.toLowerCase().trim();
  return name ? destinations.find((d) => d.name.toLowerCase() === name || d.slug === name.replace(/\s+/g, '-')) : undefined;
}

/** Validates an intent payload from an untrusted client. */
function readIntent(raw: unknown): TripIntentInputDto {
  if (!raw || typeof raw !== 'object') validationFailed([{ field: 'intent', issue: 'Trip details are missing.' }]);
  const intent = raw as TripIntentInputDto;
  const issues: Array<{ field: string; issue: string }> = [];
  const intRange = (field: keyof TripIntentInputDto, min: number, max: number, label: string) => {
    const value = intent[field];
    if (value === undefined || value === null) return;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      issues.push({ field: `intent.${field}`, issue: `${label} must be between ${min} and ${max}.` });
    }
  };
  intRange('days', 1, 30, 'Days');
  intRange('nights', 0, 30, 'Nights');
  for (const field of ['start_date', 'end_date'] as const) {
    const value = intent[field];
    if (value && (typeof value !== 'string' || !ISO_DATE.test(value))) issues.push({ field: `intent.${field}`, issue: 'Use a valid date.' });
  }
  if (intent.start_date && intent.end_date && intent.end_date < intent.start_date) {
    issues.push({ field: 'intent.end_date', issue: 'The end date must be after the start date.' });
  }
  if (intent.travellers) {
    const { adults, children, seniors } = intent.travellers;
    if ([adults, children, seniors].some((n) => typeof n !== 'number' || n < 0 || n > 20)) {
      issues.push({ field: 'intent.travellers', issue: 'Enter up to 20 travellers of each kind.' });
    } else if (adults + children + seniors === 0) {
      issues.push({ field: 'intent.travellers', issue: 'Add at least one traveller.' });
    }
  }
  if (intent.interests && (!Array.isArray(intent.interests) || intent.interests.length > 15)) {
    issues.push({ field: 'intent.interests', issue: 'Choose up to 15 interests.' });
  }
  if (intent.notes && (typeof intent.notes !== 'string' || intent.notes.length > 1000)) {
    issues.push({ field: 'intent.notes', issue: 'Notes must be 1000 characters or fewer.' });
  }
  if (issues.length) validationFailed(issues);
  return intent;
}

function applyIntent(trip: TripDto, intent: TripIntentInputDto) {
  const destination = resolveDestination(intent);
  trip.intent = { ...intent, destination: destination?.name ?? intent.destination ?? null, destination_id: destination ? `dst_${destination.slug}` : null };
  trip.destination = destination ? toDestinationSummary(destination) : null;
  trip.cover_image = trip.destination?.hero_image ?? null;
  trip.start_date = intent.start_date ?? null;
  trip.end_date = intent.end_date ?? null;
  trip.days =
    intent.days ??
    (intent.start_date && intent.end_date
      ? Math.round((Date.parse(intent.end_date) - Date.parse(intent.start_date)) / 86_400_000) + 1
      : intent.nights
        ? intent.nights + 1
        : null);
}

function advanceJob(store: MockStore, hub: RealtimeHub, job: JobRecord) {
  if (job.status === 'completed' || job.status === 'failed') return;
  const index = Math.floor((Date.now() - job._started_ms) / STAGE_MS);

  if (job._fail && index >= 3) {
    job.status = 'failed';
    job.stage = STAGES[3]!;
    job.stages_completed = STAGES.slice(0, 3);
    job.error = { code: 'generation_failed', message: 'We couldn’t finish building this itinerary. Your trip details are saved — try again.' };
  } else if (index >= STAGES.length) {
    const trip = store.trip(job.trip_id);
    if (!trip) return;
    const previous = store.currentItinerary(trip.trip_id);
    const itinerary = buildItinerary(trip, (previous?.version ?? 0) + 1);
    store.state.itineraries[trip.trip_id] = [...(store.state.itineraries[trip.trip_id] ?? []), itinerary];
    store.state.versions[trip.trip_id] = [
      ...(store.state.versions[trip.trip_id] ?? []),
      {
        version: itinerary.version,
        created_at: itinerary.created_at,
        trigger: 'generated',
        title: previous ? 'Plan regenerated' : 'Plan created',
        reason: `${itinerary.days.length}-day plan generated from your trip details.`,
        change_count: 0,
        proposal_id: null,
      },
    ];
    trip.current_itinerary_version = itinerary.version;
    if (trip.status === 'draft' || trip.status === 'planning') trip.status = 'ready';
    trip.updated_at = nowIso();
    job.status = 'completed';
    job.stage = null;
    job.stages_completed = [...STAGES];
    job.itinerary_version = itinerary.version;
    notify(store, hub, trip.owner_id, {
      category: 'trip',
      priority: 'normal',
      title: `Your ${trip.destination?.name ?? 'trip'} itinerary is ready`,
      body: itinerary.summary,
      target: { kind: 'trip', trip_id: trip.trip_id },
    });
  } else {
    job.status = 'running';
    job.stage = STAGES[index]!;
    job.stages_completed = STAGES.slice(0, index);
  }
  job.updated_at = nowIso();
  store.persist();
}

function requireProposal(ctx: HandlerContext) {
  const proposal = ctx.store.state.proposals.find((p) => p.proposal_id === ctx.params.proposalId);
  if (!proposal) fail(404, 'proposal_not_found', 'That suggestion is no longer available.');
  const { user, trip } = requireTripMember(ctx, proposal.trip_id);
  return { user, trip, proposal };
}

function requireReviewer(trip: TripDto, userId: string) {
  if (!permissionsFor(trip, userId).can_review_adaptations) {
    fail(403, 'forbidden', 'Only the trip owner and editors can review changes.');
  }
}

const extractCalls = new Map<string, number[]>();

export const tripRoutes: RouteDefinition[] = [
  route('GET', '/v1/trips', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    const rank: Record<TripDto['status'], number> = { active: 0, ready: 1, planning: 2, draft: 3, completed: 4, cancelled: 5 };
    const items = store
      .tripsFor(userId)
      .map((trip) => tripSummary(tripForViewer(store, trip, userId)))
      .sort((a, b) => rank[a.status] - rank[b.status] || b.updated_at.localeCompare(a.updated_at));
    return ok({ items, next_cursor: null, total: items.length });
  }),

  route('POST', '/v1/trips', ({ store, body, requireUser }) => {
    const user = requireUser();
    const intent = readIntent(body.intent);
    const conversationId = newId('cnv');
    const now = nowIso();
    const trip: TripDto = {
      trip_id: newId('trp'),
      title: '',
      status: 'draft',
      destination: null,
      start_date: null,
      end_date: null,
      days: null,
      cover_image: null,
      members_count: 1,
      pending_adaptations: 0,
      unread_messages: 0,
      updated_at: now,
      owner_id: user.user_id,
      intent: {},
      current_itinerary_version: null,
      conversation_id: conversationId,
      members: [{ user_id: user.user_id, display_name: user.display_name, avatar_url: null, role: 'owner', presence: 'online', location_share_id: null }],
      permissions: permissionsFor({ members: [] } as unknown as TripDto, user.user_id),
      created_at: now,
    };
    applyIntent(trip, intent);
    trip.title = readString(body, 'title', { max: 80, label: 'Trip name' }) ?? (trip.destination ? `Trip to ${trip.destination.name}` : 'New trip');

    const conversation: ConversationRecord = {
      conversation_id: conversationId,
      kind: 'trip',
      title: trip.title,
      avatar_url: null,
      trip_id: trip.trip_id,
      destination_id: trip.destination?.destination_id ?? null,
      members: [{ user_id: user.user_id, display_name: user.display_name, avatar_url: null, role: 'admin', presence: 'online', last_read_message_id: null }],
      pinned: false,
      muted: false,
      updated_at: now,
      permissions: { can_post: true, can_share_location: true },
      _read: {},
    };
    store.state.trips.push(trip);
    store.state.conversations.push(conversation);
    store.persist();
    return created(tripForViewer(store, trip, user.user_id));
  }),

  route('GET', '/v1/trips/:tripId', (ctx) => {
    const { user, trip } = requireTripMember(ctx, ctx.params.tripId!);
    return ok(tripForViewer(ctx.store, trip, user.user_id));
  }),

  route('PATCH', '/v1/trips/:tripId', (ctx) => {
    const { user, trip } = requireTripMember(ctx, ctx.params.tripId!);
    const { store, body } = ctx;
    if (!permissionsFor(trip, user.user_id).can_edit) fail(403, 'forbidden', 'Only the trip owner and editors can change trip details.');
    if (typeof body.based_on_updated_at === 'string' && body.based_on_updated_at !== trip.updated_at) {
      fail(409, 'trip_conflict', 'Someone else changed this trip while you were editing.');
    }
    if ('title' in body) trip.title = readString(body, 'title', { required: true, max: 80, label: 'Trip name' })!;
    if ('intent' in body) applyIntent(trip, readIntent(body.intent));
    trip.updated_at = nowIso();
    const conversation = trip.conversation_id ? store.conversation(trip.conversation_id) : undefined;
    if (conversation) conversation.title = trip.title;
    store.persist();
    return ok(tripForViewer(store, trip, user.user_id));
  }),

  route('POST', '/v1/trip-intents/extract', async ({ store, body, user }) => {
    const key = user?.user_id ?? 'anonymous';
    const recent = (extractCalls.get(key) ?? []).filter((t) => Date.now() - t < 60_000);
    if (recent.length >= 10) fail(429, 'rate_limited', 'Too many requests. Please wait a moment.', { retry_after_seconds: 30 });
    extractCalls.set(key, [...recent, Date.now()]);

    const text = readString(body, 'text', { required: true, min: 3, max: 1000, label: 'Trip description' })!;
    await sleep(700);
    const extraction = extractIntent(
      {
        text,
        locale: typeof body.locale === 'string' ? body.locale : undefined,
        use_profile_defaults: Boolean(body.use_profile_defaults) && Boolean(user),
        current_intent: body.current_intent && typeof body.current_intent === 'object' ? (body.current_intent as TripIntentInputDto) : null,
      },
      user ? (store.state.profiles[user.user_id] ?? null) : null,
    );
    return ok(extraction);
  }),

  route('POST', '/v1/trips/:tripId/itinerary/generate', (ctx) => {
    const { user, trip } = requireTripMember(ctx, ctx.params.tripId!);
    const { store } = ctx;
    if (!permissionsFor(trip, user.user_id).can_edit) fail(403, 'forbidden', 'Only the trip owner and editors can generate a plan.');
    if (!trip.destination) fail(422, 'destination_required', 'Add a destination before we build your itinerary.');
    if (!trip.days) fail(422, 'duration_required', 'Add how many days you’re travelling, or your dates, before we build your itinerary.');

    const running = store.state.jobs.find((j) => j.trip_id === trip.trip_id && (j.status === 'queued' || j.status === 'running'));
    if (running) return ok(strip(running));

    const job: JobRecord = {
      job_id: newId('job'),
      trip_id: trip.trip_id,
      status: 'queued',
      stage: null,
      stages_completed: [],
      itinerary_version: null,
      error: null,
      updated_at: nowIso(),
      _started_ms: Date.now(),
      _fail: mockFlags.failNextGeneration,
    };
    mockFlags.failNextGeneration = false;
    if (trip.status === 'draft') trip.status = 'planning';
    store.state.jobs.push(job);
    store.persist();
    return created(strip(job));
  }),

  route('GET', '/v1/itinerary-jobs/:jobId', (ctx) => {
    const job = ctx.store.state.jobs.find((j) => j.job_id === ctx.params.jobId);
    if (!job) fail(404, 'job_not_found', 'That planning job could not be found.');
    requireTripMember(ctx, job.trip_id);
    advanceJob(ctx.store, ctx.hub, job);
    return ok(strip(job));
  }),

  route('GET', '/v1/trips/:tripId/itinerary', (ctx) => {
    const { user, trip } = requireTripMember(ctx, ctx.params.tripId!);
    const itinerary = ctx.store.currentItinerary(trip.trip_id);
    if (!itinerary) fail(404, 'itinerary_not_found', 'This trip doesn’t have an itinerary yet.');
    maybeAutoplayAdaptation(ctx.store, ctx.hub, trip.trip_id, user.user_id);
    return ok(withBookingStatus(itinerary, ctx.store.state.bookings.filter((b) => b._owner_id === user.user_id)));
  }),

  route('GET', '/v1/trips/:tripId/itinerary/versions', (ctx) => {
    const { trip } = requireTripMember(ctx, ctx.params.tripId!);
    return ok({ items: [...(ctx.store.state.versions[trip.trip_id] ?? [])].reverse() });
  }),

  route('GET', '/v1/trips/:tripId/itinerary/versions/:version', (ctx) => {
    const { user, trip } = requireTripMember(ctx, ctx.params.tripId!);
    const itinerary = (ctx.store.state.itineraries[trip.trip_id] ?? []).find((i) => i.version === Number(ctx.params.version));
    if (!itinerary) fail(404, 'version_not_found', 'That version of the itinerary doesn’t exist.');
    return ok(withBookingStatus(itinerary, ctx.store.state.bookings.filter((b) => b._owner_id === user.user_id)));
  }),

  route('GET', '/v1/trips/:tripId/adaptations', (ctx) => {
    const { trip } = requireTripMember(ctx, ctx.params.tripId!);
    const statuses = csv(ctx.query.status);
    const items = ctx.store.state.proposals
      .filter((p) => p.trip_id === trip.trip_id && (statuses.length === 0 || statuses.includes(p.status)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return ok({ items });
  }),

  route('GET', '/v1/adaptations/:proposalId', (ctx) => ok(requireProposal(ctx).proposal)),

  route('POST', '/v1/adaptations/:proposalId/accept', async (ctx) => {
    const { user, trip, proposal } = requireProposal(ctx);
    const { store, hub, body } = ctx;
    requireReviewer(trip, user.user_id);

    const { body: response } = await idempotent<AcceptAdaptationResponseDto>(ctx, 'accept', null, () => {
      const current = store.currentItinerary(trip.trip_id);
      if (!current) fail(409, 'itinerary_missing', 'This trip no longer has an itinerary to change.');
      if (proposal.status === 'applied') {
        fail(409, 'proposal_already_applied', 'This change has already been applied.', { current_version: current.version });
      }
      if (proposal.status === 'expired') fail(409, 'proposal_expired', 'This suggestion has expired. Your current plan hasn’t changed.');
      if (proposal.status !== 'proposed' && proposal.status !== 'stale') {
        fail(409, 'proposal_not_pending', 'This suggestion can no longer be applied.');
      }
      if (proposal.status === 'stale' || proposal.based_on_version !== current.version || body.based_on_version !== current.version) {
        proposal.status = 'stale';
        store.persist();
        fail(409, 'version_conflict', 'Your itinerary changed while you were away.', { current_version: current.version });
      }
      if (mockFlags.failNextAccept) {
        mockFlags.failNextAccept = false;
        proposal.status = 'failed';
        proposal.failure_reason = 'The change couldn’t be applied. Your current plan hasn’t changed.';
        hub.publish(`trip:${trip.trip_id}`, 'adaptation.failed', { trip_id: trip.trip_id, proposal_id: proposal.proposal_id, reason: proposal.failure_reason });
        store.persist();
        fail(502, 'adaptation_apply_failed', proposal.failure_reason);
      }
      const payload = store.state.proposal_payloads[proposal.proposal_id];
      if (!payload) fail(422, 'proposal_unavailable', 'This suggestion can no longer be applied.');

      const alternativeId = typeof body.alternative_id === 'string' ? body.alternative_id : null;
      const next = applyPayload(trip, current, payload, alternativeId);
      if (proposal.trigger_type === 'user_request') next.created_by = 'replan';
      const variant = payload.variants.find((v) => v.alternative_id === alternativeId);

      store.state.itineraries[trip.trip_id]!.push(next);
      store.state.versions[trip.trip_id] = [
        ...(store.state.versions[trip.trip_id] ?? []),
        {
          version: next.version,
          created_at: next.created_at,
          trigger: proposal.trigger_type === 'user_request' ? 'replan' : 'adaptation',
          title: alternativeId ? (proposal.alternatives?.find((a) => a.alternative_id === alternativeId)?.title ?? 'Plan updated') : (proposal.title ?? 'Plan updated'),
          reason: proposal.event?.summary ?? proposal.summary,
          change_count: variant ? variant.remove.length + variant.add.length + variant.retime.length : 0,
          proposal_id: proposal.proposal_id,
        },
      ];
      proposal.status = 'applied';
      proposal.resulting_version = next.version;
      trip.current_itinerary_version = next.version;
      trip.updated_at = nowIso();
      hub.publish(`trip:${trip.trip_id}`, 'adaptation.applied', { trip_id: trip.trip_id, proposal_id: proposal.proposal_id, resulting_version: next.version });
      for (const member of trip.members) {
        if (member.user_id === user.user_id) continue;
        notify(store, hub, member.user_id, {
          category: 'trip',
          priority: 'normal',
          title: `${trip.title} updated to version ${next.version}`,
          body: `${user.display_name} approved: ${proposal.title ?? proposal.summary}`,
          target: { kind: 'trip', trip_id: trip.trip_id },
        });
      }
      store.persist();
      return { proposal: { ...proposal }, itinerary: next };
    });
    return ok(response);
  }),

  route('POST', '/v1/adaptations/:proposalId/reject', (ctx) => {
    const { user, trip, proposal } = requireProposal(ctx);
    requireReviewer(trip, user.user_id);
    if (proposal.status !== 'proposed' && proposal.status !== 'stale') {
      fail(409, 'proposal_not_pending', 'This suggestion has already been handled.');
    }
    proposal.status = 'rejected';
    ctx.hub.publish(`trip:${trip.trip_id}`, 'adaptation.rejected', { trip_id: trip.trip_id, proposal_id: proposal.proposal_id });
    ctx.store.persist();
    return ok(proposal);
  }),

  route('POST', '/v1/trips/:tripId/replan', (ctx) => {
    const { user, trip } = requireTripMember(ctx, ctx.params.tripId!);
    const { store, hub, body } = ctx;
    requireReviewer(trip, user.user_id);
    const current = store.currentItinerary(trip.trip_id);
    if (!current) fail(422, 'itinerary_missing', 'Generate an itinerary before asking for changes.');
    if (body.based_on_version !== current.version) {
      fail(409, 'version_conflict', 'Your itinerary changed while you were away.', { current_version: current.version });
    }
    const presets = (Array.isArray(body.presets) ? body.presets : []).filter((p): p is ReplanPreset => PRESETS.includes(p as ReplanPreset));
    const instruction = readString(body, 'instruction', { max: 500, label: 'Request' });
    const scope = (body.scope && typeof body.scope === 'object' ? body.scope : {}) as { day_number?: number | null; item_id?: string | null };

    const { proposal, payload } = buildReplanProposal(trip, current, {
      based_on_version: current.version,
      presets,
      instruction,
      scope: { day_number: typeof scope.day_number === 'number' ? scope.day_number : null, item_id: scope.item_id ?? null },
    });
    store.state.proposals.push(proposal);
    store.state.proposal_payloads[proposal.proposal_id] = payload;
    hub.publish(`trip:${trip.trip_id}`, 'adaptation.proposed', { proposal });
    store.persist();
    return created(proposal satisfies AdaptationProposalDto);
  }),

  route('POST', '/v1/routes/plan', ({ body }) => {
    const point = (value: unknown, field: string) => {
      const p = value as { lat?: unknown; lng?: unknown } | null;
      if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number' || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
        validationFailed([{ field, issue: 'Choose a valid place.' }]);
      }
      return { lat: p.lat as number, lng: p.lng as number };
    };
    const preferences = Array.isArray(body.preferences) ? (body.preferences as string[]) : [];
    return ok(
      planRoutes({
        origin: point(body.origin, 'origin'),
        destination: point(body.destination, 'destination'),
        modes: Array.isArray(body.modes) ? (body.modes as never[]) : [],
        preferences: preferences.filter((p) => ['fastest', 'lower_risk', 'accessible', 'less_walking', 'balanced'].includes(p)) as never[],
        trip_id: typeof body.trip_id === 'string' ? body.trip_id : null,
      }),
    );
  }),

  route('GET', '/v1/map/layers', ({ store, query }) => {
    const bbox = csv(query.bbox).map(Number);
    if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) validationFailed([{ field: 'bbox', issue: 'Map bounds are invalid.' }]);
    const layers = csv(query.layers).filter((l): l is MapLayerId => LAYERS.includes(l as MapLayerId));
    return ok(mapLayers(bbox as [number, number, number, number], layers, store.state.crowd_reports));
  }),
];
