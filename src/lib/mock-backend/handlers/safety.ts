import type {
  GeoPointDto,
  HelpPointDto,
  IncidentDto,
  LocationRecipientDto,
  LocationShareHistoryItemDto,
  SafetyContextDto,
  SosNotificationDto,
  TrustedContactDto,
} from '@/types/api';
import { haversineKm } from '@/utils/geo';
import { EMERGENCY_NUMBERS } from '../catalog/destinations';
import { HYDERABAD_PLACES } from '../catalog/places';
import { publishSos, scheduleSosProgress, sosDto } from '../effects';
import { created, fail, newId, noContent, nowIso, ok } from '../http';
import { inHyderabad } from '../logic/routes';
import type { RealtimeHub } from '../realtime';
import { route, type HandlerContext, type RouteDefinition } from '../router';
import { SOS_GUIDANCE } from '../seed/operations';
import type { MockStore, ShareRecord, SosRecord, TrustedContactRecord } from '../store';
import { idempotent, notify, readNumber, readString, requireTripMember, strip, validationFailed } from './shared';

const SAMPLE_SAFETY = 'TravIndi safety data (sample)';

const HELP_POINTS: Array<Omit<HelpPointDto, 'distance_meters'>> = [
  { help_point_id: 'hp_oldcity_police', kind: 'police', name: 'Police assistance — Old City area (sample)', coordinates: { lat: 17.3625, lng: 78.4755 }, phone: null, open_now: null },
  { help_point_id: 'hp_begumpet_police', kind: 'police', name: 'Police assistance — Begumpet area (sample)', coordinates: { lat: 17.444, lng: 78.463 }, phone: null, open_now: null },
  { help_point_id: 'hp_banjara_hospital', kind: 'hospital', name: 'Hospital — Banjara Hills area (sample)', coordinates: { lat: 17.4156, lng: 78.4462 }, phone: null, open_now: null },
  { help_point_id: 'hp_lake_tourist', kind: 'tourist_help', name: 'Tourist help desk — Hussain Sagar (sample)', coordinates: { lat: 17.4225, lng: 78.473 }, phone: null, open_now: null },
  { help_point_id: 'hp_abids_pharmacy', kind: 'pharmacy', name: 'Pharmacy — Abids area (sample)', coordinates: { lat: 17.3899, lng: 78.4747 }, phone: null, open_now: null },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s-]{8,16}$/;
const ACTIVE = (share: ShareRecord) => share.status === 'active' || share.status === 'paused';

function readPoint(value: unknown): GeoPointDto | null {
  const p = value as { lat?: unknown; lng?: unknown } | null;
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  return { lat: p.lat, lng: p.lng };
}

function nearbyLabel(point: GeoPointDto | null) {
  if (!point) return null;
  const nearest = HYDERABAD_PLACES.filter((p) => p.kind === 'attraction' || p.kind === 'experience')
    .map((p) => ({ name: p.name, km: haversineKm(point, p.coordinates) }))
    .sort((a, b) => a.km - b.km)[0];
  return nearest && nearest.km < 1.5 ? nearest.name : null;
}

const maskPhone = (phone: string | null) => (phone ? `+91 ••••• ••${phone.replace(/\D/g, '').slice(-3)}` : null);
const maskEmail = (email: string | null) => {
  if (!email) return null;
  const [local, domain] = email.split('@');
  return `${local?.[0] ?? ''}•••@${domain ?? ''}`;
};

const contactDto = (record: TrustedContactRecord): TrustedContactDto => strip(record);

function requireOwnedContact(ctx: HandlerContext) {
  const userId = ctx.requireUser().user_id;
  const contact = ctx.store.state.trusted_contacts.find((c) => c.contact_id === ctx.params.contactId && c._owner_id === userId);
  if (!contact) fail(404, 'contact_not_found', 'That contact could not be found.');
  return contact;
}

function readContact(body: Record<string, unknown>, partial: boolean) {
  const name = readString(body, 'name', { required: !partial, min: 2, max: 60, label: 'Name' });
  const relationship = readString(body, 'relationship', { required: !partial, max: 40, label: 'Relationship' });
  const phone = readString(body, 'phone', { max: 20, label: 'Phone' });
  const email = readString(body, 'email', { max: 254, label: 'Email' });
  const issues: Array<{ field: string; issue: string }> = [];
  if (phone && !PHONE.test(phone)) issues.push({ field: 'phone', issue: 'Enter a valid phone number.' });
  if (email && !EMAIL.test(email)) issues.push({ field: 'email', issue: 'Enter a valid email address.' });
  if (!partial && !phone && !email) issues.push({ field: 'phone', issue: 'Add a phone number or email.' });
  const notifyOn = Array.isArray(body.notify_on)
    ? (body.notify_on as string[]).filter((n): n is TrustedContactDto['notify_on'][number] => ['sos', 'missed_check_in', 'location_share'].includes(n))
    : undefined;
  if (issues.length) validationFailed(issues);
  return { name, relationship, phone, email, notifyOn };
}

// Location --------------------------------------------------------------------

function requireOwnedShare(ctx: HandlerContext) {
  const userId = ctx.requireUser().user_id;
  const share = ctx.store.share(ctx.params.shareId!);
  if (!share || share.owner_id !== userId) fail(404, 'share_not_found', 'That location share could not be found.');
  return share;
}

function endShare(store: MockStore, hub: RealtimeHub, share: ShareRecord, status: 'stopped' | 'revoked') {
  share.status = status;
  share._ended_at = nowIso();
  share.last_location = null;
  share.last_location_at = null;
  for (const trip of store.state.trips) {
    for (const member of trip.members) if (member.location_share_id === share.share_id) member.location_share_id = null;
  }
  hub.publish(`location_share:${share.share_id}`, 'location.revoked', { share_id: share.share_id, revoked_at: share._ended_at, revoked_by: 'owner' });
  hub.revalidate(`location_share:${share.share_id}`);
}

function resolveRecipients(ctx: HandlerContext, audience: string, tripId: string | null, recipientIds: unknown) {
  const { store } = ctx;
  const userId = ctx.requireUser().user_id;
  if (audience === 'trip_members') {
    if (!tripId) validationFailed([{ field: 'trip_id', issue: 'Choose a trip to share with.' }]);
    const { trip } = requireTripMember(ctx, tripId);
    if (trip.members.length < 2) fail(422, 'no_eligible_recipients', 'No one else is on this trip yet.');
    return [{ recipient_id: trip.trip_id, display_name: trip.title, kind: 'trip' as const }];
  }
  if (audience === 'trusted_contacts') {
    const contacts = store.state.trusted_contacts.filter((c) => c._owner_id === userId && c._linked_user_id && c.notify_on.includes('location_share'));
    if (!contacts.length) {
      fail(422, 'no_eligible_recipients', 'None of your trusted contacts use TravIndi yet, so they can’t view a live location.');
    }
    return contacts.map((c) => ({ recipient_id: c.contact_id, display_name: c.name, kind: 'trusted_contact' as const }));
  }
  const ids = Array.isArray(recipientIds) ? (recipientIds as unknown[]).filter((id): id is string => typeof id === 'string') : [];
  if (ids.length === 0 || ids.length > 20) validationFailed([{ field: 'recipient_ids', issue: 'Choose between 1 and 20 people.' }]);
  const known = new Set<string>();
  for (const trip of store.tripsFor(userId)) trip.members.forEach((m) => known.add(m.user_id));
  for (const c of store.state.conversations) if (c.kind === 'direct' && c.members.some((m) => m.user_id === userId)) c.members.forEach((m) => known.add(m.user_id));
  const recipients: LocationRecipientDto[] = [];
  for (const id of ids) {
    if (id === userId || !known.has(id) || !store.user(id)) {
      validationFailed([{ field: 'recipient_ids', issue: 'You can only share with people on your trips or in your conversations.' }]);
    }
    recipients.push({ recipient_id: id, display_name: store.displayName(id), kind: 'user' });
  }
  return recipients;
}

export const safetyRoutes: RouteDefinition[] = [
  route('GET', '/v1/safety/context', (ctx) => {
    const { store, query } = ctx;
    const trip = query.trip_id ? requireTripMember(ctx, query.trip_id).trip : null;
    const given = query.lat && query.lng ? readPoint({ lat: Number(query.lat), lng: Number(query.lng) }) : null;
    const point = given ?? trip?.destination?.coordinates ?? null;
    const slug = trip?.destination?.slug ?? (point && inHyderabad(point) ? 'hyderabad' : null);
    const advisories = slug ? (store.state.advisories[slug] ?? []) : [];

    const hasData = Boolean(point && inHyderabad(point));
    const context: SafetyContextDto = hasData
      ? {
          location_label: nearbyLabel(given) ? `Near ${nearbyLabel(given)}` : 'Hyderabad',
          level: advisories.length ? 'caution' : 'calm',
          summary: advisories.length ? 'Busy evenings are expected in the old city. Keep valuables secure.' : 'No active advisories in TravIndi’s data for this area.',
          advisories,
          nearby_help: HELP_POINTS.map((h) => ({ ...h, distance_meters: given ? Math.round(haversineKm(given, h.coordinates) * 1000) : null })).sort(
            (a, b) => (a.distance_meters ?? 0) - (b.distance_meters ?? 0),
          ),
          emergency_numbers: EMERGENCY_NUMBERS,
          freshness: { source_kind: 'application', updated_at: nowIso(), stale_after_seconds: 1800, source_label: SAMPLE_SAFETY },
        }
      : {
          location_label: trip?.destination?.name ?? null,
          level: 'unknown',
          summary: 'TravIndi doesn’t have safety data for this area yet. Emergency numbers work anywhere in India.',
          advisories,
          nearby_help: [],
          emergency_numbers: EMERGENCY_NUMBERS,
          freshness: { source_kind: 'unavailable', updated_at: null, source_label: null },
        };
    return ok(context);
  }),

  route('GET', '/v1/safety/incidents', (ctx) => {
    const { store, query } = ctx;
    let records = store.state.incidents;
    if (query.mine === 'true') {
      const userId = ctx.requireUser().user_id;
      records = records.filter((r) => r._reporter_id === userId);
    } else {
      const trip = query.trip_id ? requireTripMember(ctx, query.trip_id).trip : null;
      const centre = trip?.destination?.coordinates;
      records = records.filter((r) => r.visibility === 'public' && (!centre || !r.coordinates || haversineKm(centre, r.coordinates) < 30));
    }
    const items: IncidentDto[] = records.map((r) => strip(r)).sort((a, b) => b.reported_at.localeCompare(a.reported_at));
    return ok({ items });
  }),

  route('POST', '/v1/safety/reports', async (ctx) => {
    const user = ctx.requireUser();
    const { store, body } = ctx;
    const categories = ['theft', 'harassment', 'scam', 'accident', 'medical', 'lost_item', 'unsafe_area', 'other'];
    const clientReportId = readString(body, 'client_report_id', { required: true, max: 100, label: 'Report reference' })!;
    if (!categories.includes(String(body.category))) validationFailed([{ field: 'category', issue: 'Choose what happened.' }]);
    const description = readString(body, 'description', { required: true, min: 10, max: 4000, label: 'Description' })!;
    const occurredAt = typeof body.occurred_at === 'string' ? Date.parse(body.occurred_at) : NaN;
    if (!Number.isFinite(occurredAt) || occurredAt > Date.now() + 5 * 60_000) validationFailed([{ field: 'occurred_at', issue: 'Choose when this happened.' }]);
    const tripId = typeof body.trip_id === 'string' ? body.trip_id : null;
    if (tripId) requireTripMember(ctx, tripId);

    const { body: incident } = await idempotent(ctx, 'report', clientReportId, () => {
      const category = body.category as IncidentDto['category'];
      const record = {
        incident_id: newId('inc'),
        category,
        severity: (['harassment', 'medical', 'accident'].includes(category) ? 'high' : category === 'theft' ? 'moderate' : 'low') as IncidentDto['severity'],
        status: 'reported' as const,
        summary: description.slice(0, 140),
        location_label: readString(body, 'location_label', { max: 120, label: 'Location' }),
        coordinates: readPoint(body.coordinates),
        reported_at: nowIso(),
        updated_at: nowIso(),
        // New reports stay private to the reporter until verified.
        visibility: 'reporter' as const,
        _reporter_id: user.user_id,
        _client_report_id: clientReportId,
        _reporter_count: 1,
        _assigned_unit_label: null,
      };
      store.state.incidents.push(record);
      store.persist();
      return strip(record) as IncidentDto;
    });
    return created(incident);
  }),

  route('GET', '/v1/safety/trusted-contacts', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    return ok({ items: store.state.trusted_contacts.filter((c) => c._owner_id === userId).map(contactDto) });
  }),

  route('POST', '/v1/safety/trusted-contacts', ({ store, body, requireUser }) => {
    const user = requireUser();
    if (store.state.trusted_contacts.filter((c) => c._owner_id === user.user_id).length >= 5) {
      fail(422, 'limit_reached', 'You can add up to 5 trusted contacts.');
    }
    const input = readContact(body, false);
    const linked = input.email ? store.state.users.find((u) => u.email.toLowerCase() === input.email!.toLowerCase() && u.user_id !== user.user_id) : undefined;
    const record: TrustedContactRecord = {
      contact_id: newId('tc'),
      name: input.name!,
      relationship: input.relationship!,
      phone_masked: maskPhone(input.phone),
      email_masked: maskEmail(input.email),
      verified: false,
      notify_on: input.notifyOn ?? ['sos'],
      _owner_id: user.user_id,
      _linked_user_id: linked?.user_id ?? null,
      _phone: input.phone,
      _email: input.email,
    };
    store.state.trusted_contacts.push(record);
    store.persist();
    return created(contactDto(record));
  }),

  route('PATCH', '/v1/safety/trusted-contacts/:contactId', (ctx) => {
    const contact = requireOwnedContact(ctx);
    const input = readContact(ctx.body, true);
    if (input.name) contact.name = input.name;
    if (input.relationship) contact.relationship = input.relationship;
    if ('phone' in ctx.body) {
      contact._phone = input.phone;
      contact.phone_masked = maskPhone(input.phone);
    }
    if ('email' in ctx.body) {
      contact._email = input.email;
      contact.email_masked = maskEmail(input.email);
    }
    if (!contact._phone && !contact._email) validationFailed([{ field: 'phone', issue: 'Add a phone number or email.' }]);
    if (input.notifyOn) contact.notify_on = input.notifyOn;
    ctx.store.persist();
    return ok(contactDto(contact));
  }),

  route('DELETE', '/v1/safety/trusted-contacts/:contactId', (ctx) => {
    const contact = requireOwnedContact(ctx);
    ctx.store.state.trusted_contacts = ctx.store.state.trusted_contacts.filter((c) => c !== contact);
    ctx.store.persist();
    return noContent();
  }),

  route('GET', '/v1/safety/check-ins', (ctx) => {
    const userId = ctx.requireUser().user_id;
    const items = ctx.store.state.check_ins
      .filter((c) => c._owner_id === userId && (!ctx.query.trip_id || c.trip_id === ctx.query.trip_id))
      .sort((a, b) => a.due_at.localeCompare(b.due_at))
      .map((c) => strip(c));
    return ok({ items });
  }),

  route('POST', '/v1/safety/check-ins', (ctx) => {
    const userId = ctx.requireUser().user_id;
    const { body, store } = ctx;
    const tripId = typeof body.trip_id === 'string' ? body.trip_id : null;
    if (tripId) requireTripMember(ctx, tripId);
    const due = typeof body.due_at === 'string' ? Date.parse(body.due_at) : NaN;
    if (!Number.isFinite(due) || due < Date.now() + 60_000 || due > Date.now() + 7 * 86_400_000) {
      validationFailed([{ field: 'due_at', issue: 'Choose a time within the next 7 days.' }]);
    }
    const record = {
      check_in_id: newId('ci'),
      trip_id: tripId,
      due_at: new Date(due).toISOString(),
      status: 'scheduled' as const,
      completed_at: null,
      note: readString(body, 'note', { max: 120, label: 'Note' }),
      _owner_id: userId,
    };
    store.state.check_ins.push(record);
    store.persist();
    return created(strip(record));
  }),

  route('POST', '/v1/safety/check-ins/:checkInId', (ctx) => {
    const userId = ctx.requireUser().user_id;
    const checkIn = ctx.store.state.check_ins.find((c) => c.check_in_id === ctx.params.checkInId && c._owner_id === userId);
    if (!checkIn) fail(404, 'check_in_not_found', 'That check-in could not be found.');
    if (ctx.body.status !== 'completed') validationFailed([{ field: 'status', issue: 'Only completing a check-in is supported.' }]);
    if (checkIn.status === 'cancelled') fail(409, 'check_in_cancelled', 'This check-in was cancelled.');
    checkIn.status = 'completed';
    checkIn.completed_at = nowIso();
    ctx.store.persist();
    return ok(strip(checkIn));
  }),

  // SOS: tolerant of incomplete optional data — an emergency must never fail validation on extras.
  route('POST', '/v1/sos', (ctx) => {
    const user = ctx.requireUser();
    const { store, hub, body } = ctx;
    const clientAlertId = typeof body.client_alert_id === 'string' ? body.client_alert_id.slice(0, 100) : '';
    if (!clientAlertId) validationFailed([{ field: 'client_alert_id', issue: 'Missing alert reference.' }]);

    const existing = store.state.sos.find((a) => a._owner_id === user.user_id && a.client_alert_id === clientAlertId);
    if (existing) return ok(sosDto(existing));

    const tripId = typeof body.trip_id === 'string' && store.isTripMember(user.user_id, body.trip_id) ? body.trip_id : null;
    const coordinates = readPoint(body.coordinates);
    const now = nowIso();
    const contacts = body.notify_trusted_contacts === false
      ? []
      : store.state.trusted_contacts.filter((c) => c._owner_id === user.user_id && c.notify_on.includes('sos'));

    const notifications: SosNotificationDto[] = [
      { channel: 'travindi_team', recipient_label: 'TravIndi operations desk', status: 'delivered', updated_at: now },
      ...contacts.map((c) => ({
        channel: 'trusted_contact' as const,
        recipient_label: c.name,
        // In-app delivery only reaches contacts who use TravIndi; SMS is not connected.
        status: c._linked_user_id ? ('queued' as const) : ('not_supported' as const),
        updated_at: now,
      })),
      { channel: 'authority', recipient_label: 'Emergency services (112)', status: 'not_supported', updated_at: now },
    ];

    const record: SosRecord = {
      alert_id: newId('sos'),
      client_alert_id: clientAlertId,
      status: 'received',
      received_at: now,
      acknowledged_at: null,
      resolved_at: null,
      acknowledged_by_label: null,
      notifications,
      guidance: SOS_GUIDANCE,
      _owner_id: user.user_id,
      _trip_id: tripId,
      _coordinates: coordinates,
      _accuracy_meters: typeof body.accuracy_meters === 'number' ? body.accuracy_meters : null,
      _message: typeof body.message === 'string' ? body.message.slice(0, 500) : null,
      _location_label: nearbyLabel(coordinates),
      _priority: 'critical',
      _last_update_at: now,
      _assigned_to_label: null,
    };
    store.state.sos.push(record);
    publishSos(store, hub, record);
    scheduleSosProgress(store, hub, record.alert_id, contacts.flatMap((c) => (c._linked_user_id ? [c._linked_user_id] : [])));
    return created(sosDto(record));
  }),

  route('GET', '/v1/sos/active', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    const alert = store.state.sos
      .filter((a) => a._owner_id === userId && (a.status === 'received' || a.status === 'acknowledged' || a.status === 'responding'))
      .sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
    return ok({ alert: alert ? sosDto(alert) : null });
  }),

  route('GET', '/v1/sos/:alertId', ({ store, params, requireUser }) => {
    const user = requireUser();
    const alert = store.state.sos.find((a) => a.alert_id === params.alertId);
    if (!alert || (alert._owner_id !== user.user_id && !user.roles.includes('authority'))) fail(404, 'sos_not_found', 'That alert could not be found.');
    return ok(sosDto(alert));
  }),

  route('POST', '/v1/sos/:alertId/cancel', ({ store, hub, params, requireUser }) => {
    const userId = requireUser().user_id;
    const alert = store.state.sos.find((a) => a.alert_id === params.alertId && a._owner_id === userId);
    if (!alert) fail(404, 'sos_not_found', 'That alert could not be found.');
    if (alert.status === 'resolved' || alert.status === 'cancelled') fail(409, 'sos_closed', 'This alert is already closed.');
    alert.status = 'cancelled';
    publishSos(store, hub, alert);
    return ok(sosDto(alert));
  }),

  route('GET', '/v1/location-shares/visible', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    return ok({ items: store.state.shares.filter((s) => ACTIVE(s) && store.isShareRecipient(userId, s)).map((s) => strip(s)) });
  }),

  route('GET', '/v1/location-shares/history', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    const items: LocationShareHistoryItemDto[] = store.state.shares
      .filter((s) => s.owner_id === userId && !ACTIVE(s))
      .sort((a, b) => (b._ended_at ?? '').localeCompare(a._ended_at ?? ''))
      .map((s) => ({ share_id: s.share_id, audience_label: s.audience_label, started_at: s.started_at, ended_at: s._ended_at, status: s.status }));
    return ok({ items });
  }),

  route('POST', '/v1/location-shares/stop-all', ({ store, hub, requireUser }) => {
    const userId = requireUser().user_id;
    const active = store.state.shares.filter((s) => s.owner_id === userId && ACTIVE(s));
    active.forEach((share) => endShare(store, hub, share, 'stopped'));
    store.persist();
    return ok({ stopped_count: active.length });
  }),

  route('GET', '/v1/location-shares', ({ store, requireUser }) => {
    const userId = requireUser().user_id;
    return ok({ items: store.state.shares.filter((s) => s.owner_id === userId && ACTIVE(s)).map((s) => strip(s)) });
  }),

  route('POST', '/v1/location-shares', (ctx) => {
    const user = ctx.requireUser();
    const { store, hub, body } = ctx;
    if (!store.hasConsent(user.user_id, 'location_sharing')) {
      fail(403, 'consent_required', 'Turn on location sharing in Privacy & consents before sharing your location.');
    }
    const audience = String(body.audience);
    if (!['trip_members', 'trusted_contacts', 'custom'].includes(audience)) validationFailed([{ field: 'audience', issue: 'Choose who can see your location.' }]);
    const duration = readNumber(body, 'duration_minutes', 15, 1440, 'Duration (minutes)');
    const precision = body.precision_mode === 'approximate' ? 'approximate' : 'precise';
    const tripId = typeof body.trip_id === 'string' ? body.trip_id : null;
    const recipients = resolveRecipients(ctx, audience, tripId, body.recipient_ids);

    const share: ShareRecord = {
      share_id: newId('shr'),
      owner_id: user.user_id,
      owner_name: user.display_name,
      trip_id: tripId,
      recipient_ids: recipients.map((r) => r.recipient_id),
      recipients,
      audience_label: recipients.length === 1 ? recipients[0]!.display_name : `${recipients.length} people`,
      started_at: nowIso(),
      expires_at: new Date(Date.now() + duration * 60_000).toISOString(),
      status: 'active',
      precision_mode: precision,
      last_location_at: null,
      last_location: null,
      _ended_at: null,
      _audience: audience as ShareRecord['_audience'],
    };
    store.state.shares.push(share);
    if (audience === 'trip_members' && tripId) {
      const member = store.trip(tripId)?.members.find((m) => m.user_id === user.user_id);
      if (member) member.location_share_id = share.share_id;
    }

    const viewers = new Set<string>();
    for (const recipient of recipients) {
      if (recipient.kind === 'user') viewers.add(recipient.recipient_id);
      if (recipient.kind === 'trip') store.trip(recipient.recipient_id)?.members.forEach((m) => m.user_id !== user.user_id && viewers.add(m.user_id));
      if (recipient.kind === 'trusted_contact') {
        const linked = store.state.trusted_contacts.find((c) => c.contact_id === recipient.recipient_id)?._linked_user_id;
        if (linked) viewers.add(linked);
      }
    }
    viewers.forEach((viewer) =>
      notify(store, hub, viewer, {
        category: 'safety',
        priority: 'normal',
        title: `${user.display_name} is sharing their location with you`,
        body: `Until ${new Date(share.expires_at!).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`,
        target: { kind: 'location_share', share_id: share.share_id },
      }),
    );
    store.persist();
    return created(strip(share));
  }),

  route('GET', '/v1/location-shares/:shareId', ({ store, params, requireUser }) => {
    const userId = requireUser().user_id;
    const share = store.share(params.shareId!);
    // Not found rather than forbidden, so share ids can't be probed.
    if (!share || !store.canViewShare(userId, share)) fail(404, 'share_not_found', 'That location share isn’t available.');
    return ok(strip(share));
  }),

  route('PATCH', '/v1/location-shares/:shareId', (ctx) => {
    const share = requireOwnedShare(ctx);
    const { store, hub, body } = ctx;
    if (!ACTIVE(share)) fail(409, 'share_not_active', 'This share has ended. Start a new one to share again.');
    if (body.status === 'paused' || body.status === 'active') share.status = body.status;
    if (body.extend_minutes !== undefined) {
      const minutes = readNumber(body, 'extend_minutes', 5, 720, 'Extension (minutes)');
      const base = Math.max(Date.now(), Date.parse(share.expires_at ?? nowIso()));
      share.expires_at = new Date(base + minutes * 60_000).toISOString();
    }
    if (body.recipient_ids !== undefined) {
      if (share._audience !== 'custom') fail(422, 'recipients_fixed', 'Recipients can only be changed for shares with chosen people.');
      share.recipients = resolveRecipients(ctx, 'custom', null, body.recipient_ids);
      share.recipient_ids = share.recipients.map((r) => r.recipient_id);
      share.audience_label = share.recipients.length === 1 ? share.recipients[0]!.display_name : `${share.recipients.length} people`;
      hub.revalidate(`location_share:${share.share_id}`);
    }
    store.persist();
    return ok(strip(share));
  }),

  route('DELETE', '/v1/location-shares/:shareId', (ctx) => {
    const share = requireOwnedShare(ctx);
    if (ACTIVE(share)) endShare(ctx.store, ctx.hub, share, 'stopped');
    ctx.store.persist();
    return ok(strip(share));
  }),

  route('POST', '/v1/location-shares/:shareId/updates', (ctx) => {
    const share = requireOwnedShare(ctx);
    const { store, hub, body } = ctx;
    if (share.status === 'paused') fail(409, 'share_paused', 'Sharing is paused. Resume to send your location.');
    if (share.status !== 'active') fail(409, 'share_not_active', 'This share has ended.');
    const updates = Array.isArray(body.updates) ? (body.updates as Array<Record<string, unknown>>) : [];
    if (updates.length === 0 || updates.length > 50) validationFailed([{ field: 'updates', issue: 'Send between 1 and 50 updates.' }]);

    const valid = updates
      .filter((u) => typeof u.latitude === 'number' && typeof u.longitude === 'number' && Math.abs(u.latitude) <= 90 && Math.abs(u.longitude) <= 180)
      .filter((u) => typeof u.sequence === 'number' && typeof u.recorded_at === 'string')
      .sort((a, b) => (a.sequence as number) - (b.sequence as number))
      .filter((u) => (u.sequence as number) > (share.last_location?.sequence ?? -1));
    const latest = valid[valid.length - 1];
    if (!latest) return ok(strip(share));

    // Precision is enforced here, not trusted to the client.
    const approximate = share.precision_mode === 'approximate';
    const round = (n: number) => (approximate ? Math.round(n * 100) / 100 : n);
    share.last_location = {
      latitude: round(latest.latitude as number),
      longitude: round(latest.longitude as number),
      accuracy: approximate ? Math.max(1000, Number(latest.accuracy) || 0) : typeof latest.accuracy === 'number' ? latest.accuracy : null,
      recorded_at: latest.recorded_at as string,
      sequence: latest.sequence as number,
    };
    share.last_location_at = share.last_location.recorded_at;
    hub.publish(`location_share:${share.share_id}`, 'location.updated', { share_id: share.share_id, owner_id: share.owner_id, location: share.last_location });
    store.persist();
    return ok(strip(share));
  }),
];
