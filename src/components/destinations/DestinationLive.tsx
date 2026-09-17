'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { type ComponentType, useState } from 'react';
import { BookingSheet } from '@/components/providers/BookingSheet';
import { UNIT_PRICE_LABEL } from '@/components/providers/bookingVocabulary';
import { reputationLabel, verificationSummary } from '@/components/providers/trust';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { BedIcon, CarIcon, SuitcaseIcon } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useNow } from '@/hooks/useNow';
import { useTranslation } from '@/i18n/react';
import { api } from '@/lib/api';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { relativeTime } from '@/lib/format/freshness';
import { describeCost } from '@/lib/format/money';
import { useCommunityChannels, useCommunityPosts, useCreateCommunityPost, useToggleHelpful } from '@/lib/query/hooks/destinations';
import { useBusinesses, useGuides } from '@/lib/query/hooks/providers';
import { queryKeys } from '@/lib/query/keys';
import { toast } from '@/lib/ui/toast';
import type { BusinessCategory } from '@/types/api';
import type { Destination, Service } from '@/types/domain';
import { ADVISORY_SEVERITY } from '../safety/vocabulary';

/** Advisories change; the server-rendered copy is refreshed from the API on arrival. */
export function DestinationSafety({ initial }: { initial: Destination }) {
  const now = useNow();
  const { t } = useTranslation();
  const destination = useQuery({
    queryKey: queryKeys.destinations.detail(initial.slug),
    queryFn: ({ signal }) => api.destinations.get(initial.slug, { signal }),
    initialData: initial,
    initialDataUpdatedAt: 0,
  });
  const safety = destination.data.safety;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-[1.0625rem] leading-relaxed">{safety.summary}</p>
        <FreshnessBadge freshness={safety.freshness} />
      </div>
      {safety.advisories.length > 0 && (
        <ul className="grid gap-2">
          {safety.advisories.map((advisory) => (
            <li key={advisory.advisoryId} className="grid gap-1 rounded-2xl bg-[var(--tone-warning-bg)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={ADVISORY_SEVERITY[advisory.severity].tone}>{ADVISORY_SEVERITY[advisory.severity].label}</StatusPill>
                <span className="font-semibold">{advisory.title}</span>
              </div>
              <p>{advisory.body}</p>
              <p className="text-[0.8125rem] text-[var(--text-muted)]">
                {advisory.sourceLabel}
                {now > 0 && ` · ${relativeTime(advisory.issuedAt, now)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      <ul className="flex flex-wrap gap-2" aria-label={t('destinations.live.emergencyNumbers')}>
        {safety.emergencyNumbers.map((entry) => (
          <li key={entry.number}>
            <a href={`tel:${entry.number}`} className="tap-target inline-flex items-center gap-2 rounded-full bg-[var(--surface-raised)] px-4 font-medium ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-[var(--surface-sunken)]">
              {entry.label} <span className="font-semibold tabular-nums">{entry.number}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const OFFER_GROUPS: Array<{ category: 'stay' | 'tour_operator' | 'transport'; Icon: ComponentType<{ size?: number }> }> = [
  { category: 'stay', Icon: BedIcon },
  { category: 'tour_operator', Icon: SuitcaseIcon },
  { category: 'transport', Icon: CarIcon },
];

/** Bookable stays, packages and cabs at a destination. */
export function DestinationOffers({ destinationId, name }: { destinationId: string; name: string }) {
  const businesses = useBusinesses({ destinationId });
  const { t } = useTranslation();
  const [booking, setBooking] = useState<{ service: Service; providerName: string } | null>(null);

  if (businesses.isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (businesses.isError) return <ErrorState error={businesses.error} compact onRetry={() => void businesses.refetch()} />;

  const groups = OFFER_GROUPS.map((group) => ({
    ...group,
    offers: businesses.data.items
      .filter((business) => business.category === group.category)
      .flatMap((business) => business.services.filter((service) => service.bookable).map((service) => ({ service, business }))),
  })).filter((group) => group.offers.length > 0);

  if (groups.length === 0) return <p className="text-[var(--text-muted)]">{t('destinations.live.nothingBookable', { name })}</p>;

  return (
    <div className="grid gap-6">
      {groups.map(({ category, Icon, offers }) => (
        <div key={category} className="grid gap-3">
          <h3 className="flex items-center gap-2 text-[1.125rem] font-semibold">
            <span aria-hidden="true" className="text-terracotta">
              <Icon size={20} />
            </span>
            {t(`destinations.live.offerGroups.${category}`)}
          </h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {offers.map(({ service, business }) => {
              const price = describeCost(service.price);
              const evidence = verificationSummary(business.verification);
              return (
                <li key={service.serviceId} className="surface-card grid content-between gap-3 p-4">
                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="grid gap-0.5">
                        <span className="font-semibold leading-snug">{service.name}</span>
                        <Link href={`/businesses/${business.businessId}`} className="text-[0.875rem] text-[var(--text-muted)] underline-offset-4 hover:underline">
                          {business.name}
                        </Link>
                      </div>
                      <StatusPill tone={evidence.tone}>{evidence.label}</StatusPill>
                    </div>
                    {service.packageDetails ? (
                      <p className="text-[0.875rem] text-[var(--text-muted)]">
                        {t('destinations.live.packageDays', { count: service.packageDetails.days })} · {service.packageDetails.includes.slice(0, 2).join(' · ')}
                      </p>
                    ) : (
                      service.highlights.length > 0 && <p className="text-[0.875rem] text-[var(--text-muted)]">{service.highlights.slice(0, 2).join(' · ')}</p>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <p className="grid">
                      <span className="font-semibold">{price.label}</span>
                      {price.status !== 'unavailable' && <span className="text-[0.8125rem] text-[var(--text-muted)]">{UNIT_PRICE_LABEL[service.unit]}</span>}
                    </p>
                    <Button variant="accent" size="sm" onClick={() => setBooking({ service, providerName: business.name })}>
                      {t('destinations.live.book')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {booking && <BookingSheet service={booking.service} providerName={booking.providerName} open onClose={() => setBooking(null)} />}
    </div>
  );
}

export function DestinationProviders({ destinationId, name }: { destinationId: string; name: string }) {
  const guides = useGuides({ destinationId });
  const businesses = useBusinesses({ destinationId });
  const { t } = useTranslation();

  const block = (title: string, loading: boolean, error: unknown, retry: () => void, rows: Array<{ id: string; href: string; name: string; detail: string; evidence: ReturnType<typeof verificationSummary>; reputation: string }>) => (
    <div className="grid content-start gap-3">
      <h3 className="font-semibold">{title}</h3>
      {loading ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : error ? (
        <ErrorState error={error} compact onRetry={retry} />
      ) : rows.length === 0 ? (
        <p className="text-[var(--text-muted)]">{t('destinations.live.noneListed', { name })}</p>
      ) : (
        <ul className="surface-card divide-y divide-[var(--hairline)] overflow-hidden">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={row.href} className="grid gap-1 p-4 hover:bg-[var(--surface-sunken)]">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.name}</span>
                  <StatusPill tone={row.evidence.tone}>{row.evidence.label}</StatusPill>
                </span>
                <span className="text-[0.875rem] text-[var(--text-muted)]">{row.detail}</span>
                <span className="text-[0.8125rem] text-[var(--text-subtle)]">{row.reputation}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {block(
        t('destinations.live.localGuides'),
        guides.isPending,
        guides.error,
        () => void guides.refetch(),
        (guides.data?.items ?? []).map((g) => ({ id: g.guideId, href: `/guides/${g.guideId}`, name: g.name, detail: g.specializations.slice(0, 2).join(' · '), evidence: verificationSummary(g.verification), reputation: reputationLabel(g.reputation) })),
      )}
      {block(
        t('destinations.live.localBusinesses'),
        businesses.isPending,
        businesses.error,
        () => void businesses.refetch(),
        (businesses.data?.items ?? []).map((b) => ({ id: b.businessId, href: `/businesses/${b.businessId}`, name: b.name, detail: b.description, evidence: verificationSummary(b.verification), reputation: reputationLabel(b.reputation) })),
      )}
    </div>
  );
}

export function DestinationCommunity({ destinationId, name }: { destinationId: string; name: string }) {
  const now = useNow();
  const { t } = useTranslation();
  const { status } = useAuth();
  const channels = useCommunityChannels(destinationId);
  const [channelId, setChannelId] = useState<string | null>(null);
  const activeChannel = channelId ?? channels.data?.find((c) => c.slug === 'questions')?.channelId ?? channels.data?.[0]?.channelId ?? null;
  const posts = useCommunityPosts(activeChannel);
  const helpful = useToggleHelpful(activeChannel ?? '');
  const create = useCreateCommunityPost();
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '' });

  if (channels.isPending) return <SkeletonText lines={4} />;
  if (channels.isError) return <ErrorState error={channels.error} compact onRetry={() => void channels.refetch()} />;

  const fieldErrors = isApiError(create.error) ? create.error.fieldErrors : {};

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label={t('destinations.live.channel')}
          size="sm"
          value={activeChannel ?? ''}
          onChange={setChannelId}
          options={channels.data.map((c) => ({ value: c.channelId, label: `${c.name}${c.postCount ? ` (${c.postCount})` : ''}` }))}
        />
        {status === 'authenticated' ? (
          <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
            {t('destinations.live.postInChannel')}
          </Button>
        ) : (
          <ButtonLink href={`/login?next=${encodeURIComponent(`/destinations/${destinationId.replace(/^dst_/, '')}#community`)}`} variant="secondary" size="sm">
            {t('destinations.live.signInToPost')}
          </ButtonLink>
        )}
      </div>

      {posts.isPending ? (
        <SkeletonText lines={3} />
      ) : posts.isError ? (
        <ErrorState error={posts.error} compact onRetry={() => void posts.refetch()} />
      ) : posts.data.items.length === 0 ? (
        <p className="text-[var(--text-muted)]">{t('destinations.live.noPosts', { name })}</p>
      ) : (
        <ul className="grid gap-3">
          {posts.data.items.map((post) => (
            <li key={post.postId} className="surface-card grid gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-[0.875rem]">
                <span className="font-medium">{post.authorName}</span>
                {post.authorBadge === 'verified_guide' && <StatusPill tone="success">{t('destinations.live.verifiedGuide')}</StatusPill>}
                {post.authorBadge === 'verified_business' && <StatusPill tone="success">{t('destinations.live.verifiedBusiness')}</StatusPill>}
                {post.authorBadge === 'local' && <StatusPill>{t('destinations.live.local')}</StatusPill>}
                {now > 0 && <span className="text-[var(--text-subtle)]">{relativeTime(post.createdAt, now)}</span>}
              </div>
              <h4 className="font-semibold">{post.title}</h4>
              <p className="text-[var(--text-muted)]">{post.body}</p>
              <div className="flex flex-wrap items-center gap-3 text-[0.875rem]">
                <button
                  type="button"
                  aria-pressed={post.markedHelpfulByMe}
                  disabled={status !== 'authenticated' || helpful.isPending}
                  onClick={() => helpful.mutate(post.postId)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 ring-1 ring-inset ring-[var(--hairline-strong)] disabled:opacity-60 aria-pressed:bg-[var(--tone-accent-bg)]"
                  title={status !== 'authenticated' ? t('destinations.live.signInForHelpful') : undefined}
                >
                  {t('destinations.live.helpful', { count: post.helpfulCount })}
                </button>
                <span className="text-[var(--text-muted)]">
                  {t('destinations.live.replies', { count: post.replyCount })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        variant="sheet"
        title={t('destinations.live.postTitle')}
        description={t('destinations.live.postDescription')}
        dismissible={!create.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)} disabled={create.isPending}>
              {t('common.actions.cancel')}
            </Button>
            <Button
              variant="navy"
              loading={create.isPending}
              disabled={draft.title.trim().length < 5 || draft.body.trim().length < 10 || !activeChannel}
              onClick={() =>
                activeChannel &&
                create.mutate(
                  { channelId: activeChannel, title: draft.title.trim(), body: draft.body.trim(), tags: [] },
                  {
                    onSuccess: () => {
                      setDraft({ title: '', body: '' });
                      setAsking(false);
                      toast.success(t('destinations.live.posted'));
                    },
                  },
                )
              }
            >
              {t('destinations.live.post')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 pb-2">
          <Field label={t('destinations.live.titleLabel')} error={fieldErrors.title}>
            {(control) => <TextInput {...control} maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}
          </Field>
          <Field label={t('destinations.live.bodyLabel')} error={fieldErrors.body}>
            {(control) => <TextArea {...control} maxLength={4000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />}
          </Field>
          {create.error && !Object.keys(fieldErrors).length ? (
            isApiError(create.error) && create.error.kind === 'rate_limited' ? (
              <InlineNotice tone="warning">{create.error.message}</InlineNotice>
            ) : (
              <ErrorState error={create.error} compact />
            )
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
