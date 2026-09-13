import { allAttractions, destinations, getDestination, popularDestinations } from '@/data/destinations';
import { experiences } from '@/data/experiences';
import { getState } from '@/data/states';
import type {
  BusinessDto,
  CommunityPostDto,
  FraudReportDto,
  GuideDto,
  SearchResultDto,
  SearchResultType,
  VerificationLookupDto,
} from '@/types/api';
import { channelsFor } from '../catalog/community';
import { allDestinationSummaries, destinationDetail, toDestinationSummary } from '../catalog/destinations';
import { BUSINESSES, GUIDES, REVIEWS } from '../catalog/providers';
import { created, fail, newId, nowIso, ok, paginate } from '../http';
import { route, type RouteDefinition } from '../router';
import type { MockStore } from '../store';
import { cleanQuery, csv, idempotent, readString, validationFailed } from './shared';

const slugFrom = (id: string) => id.replace(/^dst_/, '');

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

function business(store: MockStore, base: BusinessDto): BusinessDto {
  const profile = store.state.partner_profiles[base.business_id];
  const evidence = store.state.evidence_overrides[base.business_id];
  return {
    ...base,
    ...(profile ? { description: profile.description, languages: profile.languages, services: profile.services } : {}),
    verification: evidence ?? profile?.verification ?? base.verification,
  };
}

function guide(store: MockStore, base: GuideDto): GuideDto {
  const profile = store.state.partner_profiles[base.guide_id];
  const evidence = store.state.evidence_overrides[base.guide_id];
  return {
    ...base,
    ...(profile ? { bio: profile.description, languages: profile.languages, services: profile.services } : {}),
    verification: evidence ?? profile?.verification ?? base.verification,
  };
}

const isVerified = (evidence: BusinessDto['verification']) =>
  evidence.some((e) => (e.kind === 'identity' || e.kind === 'business_registration' || e.kind === 'credential') && e.status === 'verified');

export const businessFor = (store: MockStore, id: string) => {
  const base = BUSINESSES.find((b) => b.business_id === id);
  return base ? business(store, base) : null;
};

export const guideFor = (store: MockStore, id: string) => {
  const base = GUIDES.find((g) => g.guide_id === id);
  return base ? guide(store, base) : null;
};

function postForViewer(store: MockStore, post: CommunityPostDto, userId: string | undefined): CommunityPostDto {
  return { ...post, marked_helpful_by_me: Boolean(userId && store.state.helpful[post.post_id]?.includes(userId)) };
}

const recentPosts = new Map<string, number>();

export const discoveryRoutes: RouteDefinition[] = [
  route('GET', '/v1/search', ({ store, query }) => {
    const q = cleanQuery(query.q);
    const types = new Set(csv(query.types) as SearchResultType[]);
    const wants = (type: SearchResultType) => types.size === 0 || types.has(type);
    if (q.length < 2) return ok({ query: q, results: [], suggestions: [] });

    const needle = q.toLowerCase();
    const score = (text: string) => {
      const value = text.toLowerCase();
      return value.startsWith(needle) ? 2 : value.includes(needle) ? 1 : 0;
    };
    const results: Array<SearchResultDto & { score: number }> = [];
    const push = (type: SearchResultType, items: Array<SearchResultDto & { score: number }>) => {
      if (wants(type)) results.push(...items.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 8));
    };

    push(
      'destination',
      destinations.map((d) => {
        const summary = toDestinationSummary(d);
        return {
          result_type: 'destination' as const,
          id: summary.destination_id,
          title: d.name,
          subtitle: `${summary.state} · ${d.tagline}`,
          path: ['destinations', d.slug],
          image: summary.hero_image,
          score: Math.max(score(d.name) * 2, score(getState(d.state)?.name ?? ''), d.tags.some((t) => t.includes(needle)) ? 1 : 0),
        };
      }),
    );
    push(
      'attraction',
      allAttractions.map(({ attraction, destination }) => ({
        result_type: 'attraction' as const,
        id: `atr_${attraction.slug}`,
        title: attraction.name,
        subtitle: destination.name,
        path: ['destinations', destination.slug],
        image: null,
        score: score(attraction.name),
      })),
    );
    push(
      'experience',
      experiences.map((e) => ({
        result_type: 'experience' as const,
        id: `exp_${e.slug}`,
        title: e.name,
        subtitle: getDestination(e.destination)?.name ?? '',
        path: ['destinations', e.destination],
        image: null,
        score: score(e.name),
      })),
    );
    push(
      'business',
      BUSINESSES.map((b) => ({
        result_type: 'business' as const,
        id: b.business_id,
        title: b.name,
        subtitle: b.destination_name,
        path: ['businesses', b.business_id],
        image: null,
        score: score(b.name),
      })),
    );
    push(
      'guide',
      GUIDES.map((g) => ({
        result_type: 'guide' as const,
        id: g.guide_id,
        title: g.name,
        subtitle: g.destination_names.join(', '),
        path: ['guides', g.guide_id],
        image: null,
        score: Math.max(score(g.name), g.specializations.some((s) => s.toLowerCase().includes(needle)) ? 1 : 0),
      })),
    );

    const suggestions = results.length
      ? []
      : destinations
          .map((d) => ({ name: d.name, distance: levenshtein(needle, d.name.toLowerCase().slice(0, needle.length + 1)) }))
          .filter((d) => d.distance <= 2)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3)
          .map((d) => d.name);

    void store;
    return ok({ query: q, results: results.slice(0, 24).map(({ score: _score, ...r }) => r), suggestions });
  }),

  route('GET', '/v1/destinations', ({ query }) => {
    const q = cleanQuery(query.q).toLowerCase();
    const limit = Math.min(60, Math.max(1, Number(query.limit) || 24));
    const order = new Map(popularDestinations.map((d, i) => [d.slug, i]));
    const hidden = new Set(destinations.filter((d) => d.hiddenGem).map((d) => d.slug));
    const items = allDestinationSummaries()
      .filter((d) => !q || `${d.name} ${d.state} ${d.tagline} ${d.tags.join(' ')}`.toLowerCase().includes(q))
      .filter((d) => !query.category || d.category === query.category)
      .filter((d) => !query.region || d.region.toLowerCase() === query.region.toLowerCase())
      .filter((d) => query.hidden_gems !== 'true' || hidden.has(d.slug))
      .sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
    return ok(paginate(items, query.cursor, limit));
  }),

  route('GET', '/v1/destinations/:slug', ({ store, params }) => {
    const slug = slugFrom(params.slug!);
    const detail = destinationDetail(slug, store.state.advisories[slug] ?? []);
    if (!detail) fail(404, 'destination_not_found', 'We couldn’t find that destination.');
    return ok(detail);
  }),

  route('GET', '/v1/destinations/:destinationId/community/channels', ({ store, params }) => {
    const slug = slugFrom(params.destinationId!);
    if (!getDestination(slug)) fail(404, 'destination_not_found', 'We couldn’t find that destination.');
    return ok({ items: channelsFor(`dst_${slug}`, store.state.community_posts) });
  }),

  route('GET', '/v1/community/channels/:channelId/posts', ({ store, params, query, user }) => {
    const posts = store.state.community_posts
      .filter((p) => p.channel_id === params.channelId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => postForViewer(store, p, user?.user_id));
    return ok(paginate(posts, query.cursor, 20));
  }),

  route('POST', '/v1/community/channels/:channelId/posts', ({ store, params, body, requireUser }) => {
    const user = requireUser();
    const match = /^ch_dst_(.+)_(general|food|heritage|events|questions)$/.exec(params.channelId!);
    if (!match || !getDestination(match[1]!)) fail(404, 'channel_not_found', 'That community channel doesn’t exist.');
    const last = recentPosts.get(user.user_id) ?? 0;
    if (Date.now() - last < 30_000) {
      fail(429, 'posting_too_fast', 'You’re posting quickly. Please wait a moment before posting again.', { retry_after_seconds: 30 });
    }
    const title = readString(body, 'title', { required: true, min: 5, max: 120, label: 'Title' })!;
    const text = readString(body, 'body', { required: true, min: 10, max: 4000, label: 'Post' })!;
    const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];
    if (tags.length > 5 || tags.some((t) => t.length > 30)) validationFailed([{ field: 'tags', issue: 'Use up to 5 short tags.' }]);

    const record = store.user(user.user_id);
    const providerId = record?._provider_id;
    const provider = providerId ? (businessFor(store, providerId) ?? guideFor(store, providerId)) : null;
    const post: CommunityPostDto = {
      post_id: newId('post'),
      channel_id: params.channelId!,
      author_name: user.display_name,
      author_badge: provider && isVerified(provider.verification) ? (user.roles.includes('guide') ? 'verified_guide' : 'verified_business') : null,
      title,
      body: text,
      tags: tags.map((t) => t.trim()).filter(Boolean),
      created_at: nowIso(),
      reply_count: 0,
      helpful_count: 0,
      marked_helpful_by_me: false,
    };
    store.state.community_posts.unshift(post);
    recentPosts.set(user.user_id, Date.now());
    store.persist();
    return created(post);
  }),

  route('POST', '/v1/community/posts/:postId/helpful', ({ store, params, requireUser }) => {
    const userId = requireUser().user_id;
    const post = store.state.community_posts.find((p) => p.post_id === params.postId);
    if (!post) fail(404, 'post_not_found', 'That post is no longer available.');
    const marked = store.state.helpful[post.post_id] ?? [];
    const has = marked.includes(userId);
    store.state.helpful[post.post_id] = has ? marked.filter((id) => id !== userId) : [...marked, userId];
    post.helpful_count = Math.max(0, post.helpful_count + (has ? -1 : 1));
    store.persist();
    return ok(postForViewer(store, post, userId));
  }),

  route('GET', '/v1/businesses', ({ store, query }) => {
    const q = cleanQuery(query.q).toLowerCase();
    const items = BUSINESSES.map((b) => business(store, b))
      .filter((b) => !query.destination_id || b.destination_id === query.destination_id)
      .filter((b) => !query.category || b.category === query.category)
      .filter((b) => !query.language || b.languages.some((l) => l.toLowerCase() === query.language!.toLowerCase()))
      .filter((b) => query.verified_only !== 'true' || isVerified(b.verification))
      .filter((b) => !q || `${b.name} ${b.description}`.toLowerCase().includes(q));
    return ok(paginate(items, query.cursor, Math.min(50, Number(query.limit) || 20)));
  }),

  route('GET', '/v1/businesses/:id', ({ store, params }) => {
    const found = businessFor(store, params.id!);
    if (!found) fail(404, 'business_not_found', 'We couldn’t find that business.');
    return ok(found);
  }),

  route('GET', '/v1/businesses/:id/reviews', ({ params, query }) => ok(paginate(REVIEWS[params.id!] ?? [], query.cursor, 10))),

  route('GET', '/v1/guides', ({ store, query }) => {
    const q = cleanQuery(query.q).toLowerCase();
    const items = GUIDES.map((g) => guide(store, g))
      .filter((g) => !query.destination_id || g.destination_ids.includes(query.destination_id))
      .filter((g) => !query.language || g.languages.some((l) => l.toLowerCase() === query.language!.toLowerCase()))
      .filter((g) => query.verified_only !== 'true' || isVerified(g.verification))
      .filter((g) => !q || `${g.name} ${g.specializations.join(' ')} ${g.bio}`.toLowerCase().includes(q));
    return ok(paginate(items, query.cursor, Math.min(50, Number(query.limit) || 20)));
  }),

  route('GET', '/v1/guides/:id', ({ store, params }) => {
    const found = guideFor(store, params.id!);
    if (!found) fail(404, 'guide_not_found', 'We couldn’t find that guide.');
    return ok(found);
  }),

  route('GET', '/v1/guides/:id/reviews', ({ params, query }) => ok(paginate(REVIEWS[params.id!] ?? [], query.cursor, 10))),

  route('GET', '/v1/trust/lookup', ({ store, query }) => {
    const q = cleanQuery(query.q);
    if (q.length < 3) validationFailed([{ field: 'q', issue: 'Enter at least 3 characters.' }]);
    const needle = q.toLowerCase();
    let result: VerificationLookupDto;

    if (/^TVD-[A-Z0-9]{6}$/i.test(q)) {
      const booking = store.state.bookings.find((b) => b.confirmation_code?.toUpperCase() === q.toUpperCase());
      const today = new Date().toISOString().slice(0, 10);
      const valid = Boolean(booking && booking.status === 'confirmed' && booking.date >= today);
      result = booking
        ? {
            query: q,
            match: { kind: 'ticket', ticket_id: booking.ticket?.ticket_id ?? booking.booking_id, booking_status: booking.status, valid, provider_name: booking.provider.name, checked_at: nowIso() },
            message: valid ? 'This code matches a confirmed booking.' : 'This code matches a booking that isn’t currently valid.',
          }
        : { query: q, match: null, message: 'This code doesn’t match any TravIndi booking. Don’t pay against it until you’ve checked with the provider.' };
      return ok(result);
    }

    const b = BUSINESSES.map((x) => business(store, x)).find((x) => x.business_id === q || x.name.toLowerCase().includes(needle));
    const g = GUIDES.map((x) => guide(store, x)).find((x) => x.guide_id === q || x.name.toLowerCase().includes(needle));
    if (b) {
      result = { query: q, match: { kind: 'business', business: b }, message: isVerified(b.verification) ? 'This listing has verification evidence on TravIndi. Check the details match who you’re dealing with.' : 'This listing is on TravIndi but hasn’t completed verification.' };
    } else if (g) {
      result = { query: q, match: { kind: 'guide', guide: g }, message: isVerified(g.verification) ? 'This guide has verification evidence on TravIndi. Check the details match who you’re dealing with.' : 'This guide is on TravIndi but hasn’t completed verification.' };
    } else {
      result = { query: q, match: null, message: 'We couldn’t find this on TravIndi. That doesn’t prove it’s fraudulent — avoid paying in advance and check official sources.' };
    }
    return ok(result);
  }),

  route('POST', '/v1/trust/fraud-reports', async (ctx) => {
    const user = ctx.requireUser();
    const { body, store } = ctx;
    const categories = ['impersonation', 'overcharging', 'fake_listing', 'payment_scam', 'harassment', 'other'];
    const clientReportId = readString(body, 'client_report_id', { required: true, max: 100, label: 'Report reference' })!;
    if (!categories.includes(String(body.category))) validationFailed([{ field: 'category', issue: 'Choose what happened.' }]);
    readString(body, 'description', { required: true, min: 20, max: 4000, label: 'Description' });

    const { body: report } = await idempotent(ctx, 'fraud', clientReportId, () => {
      const dto: FraudReportDto = {
        report_id: newId('frd'),
        client_report_id: clientReportId,
        status: 'received',
        received_at: nowIso(),
        reference_code: `FR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      };
      store.state.fraud_reports.push({ owner_id: user.user_id, value: dto });
      store.persist();
      return dto;
    });
    return created(report);
  }),
];
