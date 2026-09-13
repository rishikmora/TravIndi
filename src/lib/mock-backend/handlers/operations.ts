import type {
  AnalyticsSeriesDto,
  AuthorityAnalyticsDto,
  AuthorityIncidentDto,
  AuthorityOverviewDto,
  AvailabilitySlotDto,
  PartnerDashboardDto,
  VerificationEvidenceDto,
} from '@/types/api';
import { BUSINESSES, GUIDES, REVIEWS } from '../catalog/providers';
import { authoritySosItem, publishSos } from '../effects';
import { fail, newId, nowIso, ok } from '../http';
import { route, type HandlerContext, type RouteDefinition } from '../router';
import type { IncidentRecord } from '../store';
import { csv, notify, readNumber, readString, strip, validationFailed } from './shared';

const SAMPLE_LABEL = 'Sample data — not real activity';
const OPEN_SOS = ['received', 'acknowledged', 'responding'];
const SEVERITY_RANK = { critical: 0, high: 1, moderate: 2, low: 3 } as const;
const today = () => new Date().toISOString().slice(0, 10);

const incidentDto = (record: IncidentRecord): AuthorityIncidentDto => ({
  ...strip(record),
  reporter_count: record._reporter_count,
  assigned_unit_label: record._assigned_unit_label,
});

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOC_TO_EVIDENCE: Record<string, VerificationEvidenceDto['kind']> = {
  identity: 'identity',
  business_registration: 'business_registration',
  guide_licence: 'credential',
};

function requirePartner(ctx: HandlerContext) {
  const user = ctx.requireUser();
  if (!user.roles.includes('guide') && !user.roles.includes('business')) fail(403, 'forbidden', 'This area is for TravIndi partners.');
  const providerId = ctx.store.providerIdFor(user.user_id);
  const profile = providerId ? ctx.store.state.partner_profiles[providerId] : undefined;
  if (!providerId || !profile) fail(404, 'partner_profile_missing', 'Your partner profile isn’t set up yet.');
  return { user, providerId, profile };
}

export const operationsRoutes: RouteDefinition[] = [
  route('GET', '/v1/authority/overview', (ctx) => {
    ctx.requireRole('authority');
    const { state } = ctx.store;
    const now = Date.now();
    const overview: AuthorityOverviewDto = {
      open_sos: state.sos.filter((a) => OPEN_SOS.includes(a.status)).length,
      critical_incidents: state.incidents.filter((i) => i.severity === 'critical' && (i.status === 'reported' || i.status === 'verified')).length,
      pending_verifications: state.verification_requests.filter((v) => v.status === 'pending' || v.status === 'in_review').length,
      active_advisories: Object.values(state.advisories).flat().filter((a) => !a.expires_at || Date.parse(a.expires_at) > now).length,
      freshness: { source_kind: 'application', updated_at: nowIso(), stale_after_seconds: 60, source_label: 'TravIndi operations (sample data)' },
    };
    return ok(overview);
  }),

  route('GET', '/v1/authority/sos', (ctx) => {
    ctx.requireRole('authority');
    const statuses = csv(ctx.query.status);
    const priority = { critical: 0, high: 1, normal: 2 } as const;
    const items = ctx.store.state.sos
      .filter((a) => statuses.length === 0 || statuses.includes(a.status))
      .sort(
        (a, b) =>
          Number(!OPEN_SOS.includes(a.status)) - Number(!OPEN_SOS.includes(b.status)) ||
          priority[a._priority] - priority[b._priority] ||
          b.received_at.localeCompare(a.received_at),
      )
      .map((a) => authoritySosItem(ctx.store, a));
    return ok({ items });
  }),

  route('POST', '/v1/authority/sos/:alertId/actions', (ctx) => {
    const officer = ctx.requireRole('authority');
    const { store, hub, body } = ctx;
    const alert = store.state.sos.find((a) => a.alert_id === ctx.params.alertId);
    if (!alert) fail(404, 'sos_not_found', 'That alert could not be found.');
    readString(body, 'note', { max: 500, label: 'Note' });
    const action = body.action;
    const now = nowIso();

    if (action === 'acknowledge' && alert.status === 'received') {
      alert.status = 'acknowledged';
      alert.acknowledged_at = now;
      alert.acknowledged_by_label = officer.display_name;
    } else if (action === 'mark_responding' && (alert.status === 'received' || alert.status === 'acknowledged')) {
      alert.acknowledged_at ??= now;
      alert.acknowledged_by_label ??= officer.display_name;
      alert.status = 'responding';
      alert._assigned_to_label = officer.display_name;
    } else if (action === 'resolve' && OPEN_SOS.includes(alert.status)) {
      alert.status = 'resolved';
      alert.resolved_at = now;
    } else if (!['acknowledge', 'mark_responding', 'resolve'].includes(String(action))) {
      validationFailed([{ field: 'action', issue: 'Choose an action.' }]);
    } else {
      fail(409, 'invalid_transition', `This alert is already ${alert.status}.`);
    }

    publishSos(store, hub, alert);
    const messages = {
      acknowledged: ['Your SOS was acknowledged', 'The operations desk has seen your alert. If you are in immediate danger, call 112.'],
      responding: ['The operations desk is coordinating a response', 'Keep your phone with you. If you are in immediate danger, call 112.'],
      resolved: ['Your SOS was marked resolved', 'If you still need help, raise a new alert or call 112.'],
    } as const;
    const message = messages[alert.status as keyof typeof messages];
    if (message) {
      notify(store, hub, alert._owner_id, {
        category: 'safety',
        priority: 'critical',
        title: message[0],
        body: message[1],
        target: { kind: 'sos', alert_id: alert.alert_id },
      });
    }
    return ok(authoritySosItem(store, alert));
  }),

  route('GET', '/v1/authority/incidents', (ctx) => {
    ctx.requireRole('authority');
    const severities = csv(ctx.query.severity);
    const statuses = csv(ctx.query.status);
    const since = ctx.query.since ? Date.parse(ctx.query.since) : NaN;
    const items = ctx.store.state.incidents
      .filter((i) => severities.length === 0 || severities.includes(i.severity))
      .filter((i) => statuses.length === 0 || statuses.includes(i.status))
      .filter((i) => !Number.isFinite(since) || Date.parse(i.reported_at) >= since)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.reported_at.localeCompare(a.reported_at))
      .map(incidentDto);
    return ok({ items });
  }),

  route('POST', '/v1/authority/incidents/:incidentId/actions', (ctx) => {
    ctx.requireRole('authority');
    const { store, hub, body } = ctx;
    const incident = store.state.incidents.find((i) => i.incident_id === ctx.params.incidentId);
    if (!incident) fail(404, 'incident_not_found', 'That incident could not be found.');
    readString(body, 'note', { max: 500, label: 'Note' });
    const action = body.action;

    if (action === 'verify' && incident.status === 'reported') {
      incident.status = 'verified';
      incident.visibility = 'public';
      if (incident._reporter_id) {
        notify(store, hub, incident._reporter_id, {
          category: 'safety',
          priority: 'normal',
          title: 'Your report was verified',
          body: 'Other travellers nearby can now see this safety information. Thank you.',
          target: null,
        });
      }
    } else if (action === 'resolve' && (incident.status === 'reported' || incident.status === 'verified')) {
      incident.status = 'resolved';
    } else if (action === 'dismiss' && incident.status === 'reported') {
      incident.status = 'dismissed';
    } else if (!['verify', 'resolve', 'dismiss'].includes(String(action))) {
      validationFailed([{ field: 'action', issue: 'Choose an action.' }]);
    } else {
      fail(409, 'invalid_transition', `This incident is already ${incident.status}.`);
    }
    incident.updated_at = nowIso();
    store.persist();
    return ok(incidentDto(incident));
  }),

  route('GET', '/v1/authority/verifications', (ctx) => {
    ctx.requireRole('authority');
    const statuses = csv(ctx.query.status);
    const items = ctx.store.state.verification_requests
      .filter((v) => statuses.length === 0 || statuses.includes(v.status))
      .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
    return ok({ items });
  }),

  route('POST', '/v1/authority/verifications/:requestId/decision', (ctx) => {
    ctx.requireRole('authority');
    const { store, body } = ctx;
    const request = store.state.verification_requests.find((v) => v.request_id === ctx.params.requestId);
    if (!request) fail(404, 'verification_not_found', 'That verification request could not be found.');
    const decision = body.decision;
    if (decision !== 'approve' && decision !== 'reject' && decision !== 'request_info') {
      validationFailed([{ field: 'decision', issue: 'Choose a decision.' }]);
    }
    const note = readString(body, 'note', { required: decision !== 'approve', min: 3, max: 1000, label: 'Note' });
    if (!['pending', 'in_review', 'needs_info'].includes(request.status)) fail(409, 'already_decided', 'A decision has already been recorded.');

    const profile = store.state.partner_profiles[request.subject_id];
    if (decision === 'approve') {
      request.status = 'approved';
      request.documents = request.documents.map((d) => ({ ...d, status: 'accepted' }));
      const base =
        store.state.evidence_overrides[request.subject_id] ??
        profile?.verification ??
        BUSINESSES.find((b) => b.business_id === request.subject_id)?.verification ??
        GUIDES.find((g) => g.guide_id === request.subject_id)?.verification ??
        [];
      const kinds = new Set(request.documents.flatMap((d) => (DOC_TO_EVIDENCE[d.kind] ? [DOC_TO_EVIDENCE[d.kind]!] : [])));
      const updated = base.filter((e) => !kinds.has(e.kind));
      kinds.forEach((kind) =>
        updated.push({
          kind,
          status: 'verified',
          verified_at: nowIso(),
          expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
          verifier_label: 'TravIndi verification (sample data)',
          note: null,
        }),
      );
      store.state.evidence_overrides[request.subject_id] = updated;
      if (profile) {
        profile.kyc_status = 'approved';
        profile.kyc_note = null;
        profile.verification = updated;
      }
    } else {
      request.status = decision === 'reject' ? 'rejected' : 'needs_info';
      if (profile) {
        profile.kyc_status = decision === 'reject' ? 'rejected' : 'needs_info';
        profile.kyc_note = note;
      }
    }
    store.persist();
    return ok(request);
  }),

  route('GET', '/v1/authority/analytics', (ctx) => {
    ctx.requireRole('authority');
    const range = ctx.query.range === '24h' || ctx.query.range === '30d' ? ctx.query.range : '7d';
    const count = range === '24h' ? 24 : range === '7d' ? 7 : 30;
    const step = range === '24h' ? 3_600_000 : 86_400_000;
    const now = Date.now();
    const freshness = { source_kind: 'application' as const, updated_at: nowIso(), source_label: SAMPLE_LABEL };

    const series = (metric: AnalyticsSeriesDto['metric'], label: string, unit: string, seed: number, min: number, spread: number): AnalyticsSeriesDto => {
      const random = mulberry32(seed + count);
      return {
        metric,
        label,
        unit,
        points: Array.from({ length: count }, (_, i) => ({
          t: new Date(now - (count - 1 - i) * step).toISOString(),
          value: Math.round(min + random() * spread),
        })),
        freshness,
      };
    };
    const scale = range === '24h' ? 0.15 : 1;
    const byCategory = new Map<string, number>();
    ctx.store.state.incidents.forEach((i) => byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1));

    const analytics: AuthorityAnalyticsDto = {
      range,
      series: [
        series('sos_alerts', 'SOS alerts', 'alerts', 11, 0, 4 * scale + 1),
        series('incident_reports', 'Incident reports', 'reports', 23, 1, 10 * scale + 1),
        series('active_trips', 'Active trips', 'trips', 37, 40, 30),
        series('verifications_completed', 'Verifications completed', 'decisions', 53, 0, 3 * scale + 1),
      ],
      incidents_by_category: [...byCategory.entries()].map(([category, value]) => ({ category, count: value })).sort((a, b) => b.count - a.count),
    };
    return ok(analytics);
  }),

  route('GET', '/v1/partner/dashboard', (ctx) => {
    const { providerId, profile } = requirePartner(ctx);
    const { state } = ctx.store;
    const serviceIds = new Set(profile.services.map((s) => s.service_id));
    const dashboard: PartnerDashboardDto = {
      profile,
      upcoming_bookings: state.bookings
        .filter((b) => b.provider.provider_id === providerId && b.date >= today() && ['confirmed', 'processing', 'payment_pending'].includes(b.status))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((b) => strip(b)),
      recent_reviews: REVIEWS[providerId] ?? [],
      open_complaints: state.complaints
        .filter((c) => c._provider_id === providerId && (c.status === 'open' || c.status === 'responded'))
        .map((c) => strip(c)),
      availability: state.availability
        .filter((s) => serviceIds.has(s.service_id) && s.date >= today())
        .sort((a, b) => a.date.localeCompare(b.date) || a.time_slot.localeCompare(b.time_slot)),
    };
    return ok(dashboard);
  }),

  route('PATCH', '/v1/partner/profile', (ctx) => {
    const { profile } = requirePartner(ctx);
    const { body } = ctx;
    if ('description' in body) profile.description = readString(body, 'description', { required: true, min: 20, max: 2000, label: 'Description' })!;
    if ('languages' in body) {
      const languages = body.languages;
      if (!Array.isArray(languages) || languages.length === 0 || languages.length > 10 || languages.some((l) => typeof l !== 'string' || l.length > 40)) {
        validationFailed([{ field: 'languages', issue: 'List between 1 and 10 languages.' }]);
      }
      profile.languages = languages as string[];
    }
    profile.updated_at = nowIso();
    ctx.store.persist();
    return ok(profile);
  }),

  route('PATCH', '/v1/partner/services/:serviceId', (ctx) => {
    const { profile } = requirePartner(ctx);
    const { body } = ctx;
    const service = profile.services.find((s) => s.service_id === ctx.params.serviceId);
    if (!service) fail(404, 'service_not_found', 'That service isn’t part of your listing.');
    if ('name' in body) service.name = readString(body, 'name', { required: true, min: 3, max: 80, label: 'Service name' })!;
    if ('description' in body) service.description = readString(body, 'description', { max: 500, label: 'Description' }) ?? '';
    if ('bookable' in body) {
      if (typeof body.bookable !== 'boolean') validationFailed([{ field: 'bookable', issue: 'Choose on or off.' }]);
      if (body.bookable && profile.kyc_status !== 'approved') fail(409, 'kyc_required', 'Bookings can be turned on after your verification is approved.');
      if (body.bookable && service.price.status === 'unavailable') fail(422, 'price_required', 'Add a price before accepting bookings.');
      service.bookable = body.bookable;
    }
    profile.updated_at = nowIso();
    ctx.store.persist();
    return ok(service);
  }),

  route('POST', '/v1/partner/availability', (ctx) => {
    const { profile } = requirePartner(ctx);
    const { body, store } = ctx;
    const serviceId = readString(body, 'service_id', { required: true, max: 100, label: 'Service' })!;
    if (!profile.services.some((s) => s.service_id === serviceId)) fail(404, 'service_not_found', 'That service isn’t part of your listing.');
    const date = readString(body, 'date', { required: true, max: 10, label: 'Date' })!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) validationFailed([{ field: 'date', issue: 'Choose today or a later date.' }]);
    const timeSlot = readString(body, 'time_slot', { required: true, max: 5, label: 'Time' })!;
    if (!/^\d{2}:\d{2}$/.test(timeSlot)) validationFailed([{ field: 'time_slot', issue: 'Use a time like 07:30.' }]);
    const capacity = readNumber(body, 'capacity', 1, 100, 'Capacity');
    const status = body.status === 'closed' ? 'closed' : 'open';

    let slot = store.state.availability.find((s) => s.service_id === serviceId && s.date === date && s.time_slot === timeSlot);
    if (slot) {
      if (capacity < slot.booked) validationFailed([{ field: 'capacity', issue: `${slot.booked} places are already booked for this time.` }]);
      slot.capacity = capacity;
      slot.status = status;
    } else {
      slot = { slot_id: newId('slot'), service_id: serviceId, date, time_slot: timeSlot, capacity, booked: 0, status } satisfies AvailabilitySlotDto;
      store.state.availability.push(slot);
    }
    store.persist();
    return ok(slot);
  }),

  route('POST', '/v1/partner/kyc', (ctx) => {
    const { providerId, profile } = requirePartner(ctx);
    const { body, store } = ctx;
    const allowed = ['identity', 'business_registration', 'guide_licence', 'address_proof', 'other'];
    const kinds = Array.isArray(body.document_kinds) ? (body.document_kinds as unknown[]).filter((k): k is string => typeof k === 'string' && allowed.includes(k)) : [];
    if (kinds.length === 0) validationFailed([{ field: 'document_kinds', issue: 'Add at least one document.' }]);
    if (profile.kyc_status === 'approved') fail(409, 'kyc_already_approved', 'Your verification is already approved.');

    profile.kyc_status = 'submitted';
    profile.kyc_note = null;
    profile.updated_at = nowIso();
    const documents = kinds.map((kind) => ({ document_id: newId('doc'), kind: kind as never, status: 'received' as const, uploaded_at: nowIso() }));
    const existing = store.state.verification_requests.find((v) => v.subject_id === providerId && ['pending', 'in_review', 'needs_info'].includes(v.status));
    if (existing) {
      existing.documents.push(...documents);
      existing.status = 'pending';
    } else {
      store.state.verification_requests.push({
        request_id: newId('vr'),
        subject_type: profile.provider_type,
        subject_id: providerId,
        subject_name: profile.name,
        destination_name: null,
        submitted_at: nowIso(),
        status: 'pending',
        documents,
        review_flags: [],
      });
    }
    store.persist();
    return ok(profile);
  }),

  route('POST', '/v1/partner/complaints/:complaintId/respond', (ctx) => {
    const { providerId } = requirePartner(ctx);
    const complaint = ctx.store.state.complaints.find((c) => c.complaint_id === ctx.params.complaintId && c._provider_id === providerId);
    if (!complaint) fail(404, 'complaint_not_found', 'That complaint could not be found.');
    const response = readString(ctx.body, 'response', { required: true, min: 10, max: 2000, label: 'Response' })!;
    if (complaint.status !== 'open') fail(409, 'already_responded', 'You’ve already responded to this complaint.');
    complaint.status = 'responded';
    complaint._response = response;
    ctx.store.persist();
    return ok(strip(complaint));
  }),
];
