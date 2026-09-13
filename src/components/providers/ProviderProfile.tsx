'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageShell, Section } from '@/components/app/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { ChevronLeftIcon, FlagIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { isApiError } from '@/lib/api/errors';
import { formatDate, formatDuration } from '@/lib/format/dates';
import { describeCost } from '@/lib/format/money';
import { useBusiness, useBusinessReviews, useGuide, useGuideReviews } from '@/lib/query/hooks/providers';
import type { Availability, Page, Reputation, Review, Service, VerificationEvidence } from '@/types/domain';
import { BookingSheet } from './BookingSheet';
import { quantityLabel, UNIT_PRICE_LABEL } from './bookingVocabulary';
import { BUSINESS_CATEGORY } from './ProviderDirectory';
import { EVIDENCE_LABEL, EVIDENCE_STATUS, reputationLabel, verificationSummary } from './trust';

const AVAILABILITY: Record<Availability['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  available: { label: 'Available', tone: 'success' },
  limited: { label: 'Limited availability', tone: 'warning' },
  unavailable: { label: 'Unavailable', tone: 'danger' },
  unknown: { label: 'Availability unknown', tone: 'neutral' },
};

interface ProfileData {
  backHref: string;
  backLabel: string;
  name: string;
  subtitle: string;
  about: string;
  facts: Array<{ term: string; value: string }>;
  verification: VerificationEvidence[];
  reputation: Reputation;
  availability: Availability | null;
  services: Service[];
  reviews: { data?: Page<Review>; isPending: boolean; error: unknown };
  reportHref: string;
}

function Profile({ data }: { data: ProfileData }) {
  const [booking, setBooking] = useState<Service | null>(null);
  const summary = verificationSummary(data.verification);

  return (
    <div className="grid gap-8">
      <Link href={data.backHref} className="inline-flex w-fit items-center gap-1 text-[0.875rem] text-[var(--text-muted)] hover:text-[var(--text)]">
        <ChevronLeftIcon size={16} />
        {data.backLabel}
      </Link>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar name={data.name} size="lg" decorative className="[&>span]:size-20 [&>span]:text-[1.5rem]" />
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
            {data.availability && <StatusPill tone={AVAILABILITY[data.availability.status].tone}>{AVAILABILITY[data.availability.status].label}</StatusPill>}
          </div>
          <h1 className="text-[clamp(1.875rem,4vw,2.5rem)] font-semibold tracking-[-0.03em]">{data.name}</h1>
          <p className="text-[var(--text-muted)]">{data.subtitle}</p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-8">
          <Section title="About" level={2}>
            <p className="text-[1.0625rem] leading-relaxed">{data.about}</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              {data.facts.map((fact) => (
                <div key={fact.term}>
                  <dt className="label text-[var(--text-subtle)]">{fact.term}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Services" level={2} description="Prices are shown as the provider lists them. Estimates are labelled.">
            {data.services.length === 0 ? (
              <p className="text-[var(--text-muted)]">No services are listed.</p>
            ) : (
              <ul className="grid gap-3">
                {data.services.map((service) => {
                  const price = describeCost(service.price);
                  return (
                    <li key={service.serviceId} className="surface-card grid gap-2 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="grid gap-0.5">
                          <h3 className="font-semibold">{service.name}</h3>
                          <p className="text-[0.9375rem] text-[var(--text-muted)]">{service.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{price.label}</p>
                          {price.status === 'estimate' && <p className="text-[0.8125rem] text-[var(--text-muted)]">Estimate</p>}
                          {price.status !== 'unavailable' && <p className="text-[0.8125rem] text-[var(--text-muted)]">{UNIT_PRICE_LABEL[service.unit]}</p>}
                        </div>
                      </div>
                      {service.packageDetails && (
                        <div className="grid gap-1 rounded-2xl bg-[var(--tone-neutral-bg)] p-3 text-[0.9375rem]">
                          <p className="font-semibold">
                            {service.packageDetails.days} days · {service.packageDetails.nights} {service.packageDetails.nights === 1 ? 'night' : 'nights'}
                          </p>
                          <p className="text-[var(--text-muted)]">Includes {service.packageDetails.includes.join(', ').replace(/^./, (c) => c.toLowerCase())}.</p>
                        </div>
                      )}
                      {service.highlights.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5" aria-label="Highlights">
                          {service.highlights.map((highlight) => (
                            <li key={highlight}>
                              <StatusPill>{highlight}</StatusPill>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[0.875rem] text-[var(--text-muted)]">
                          {[
                            formatDuration(service.durationMinutes),
                            service.capacity ? (service.unit === 'group' ? `Groups of up to ${service.capacity}` : `Up to ${quantityLabel(service.unit, service.capacity, null)} per booking`) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {service.bookable ? (
                          <Button variant="accent" size="sm" onClick={() => setBooking(service)}>
                            Book
                          </Button>
                        ) : (
                          <span className="text-[0.875rem] text-[var(--text-muted)]">Not bookable through TravIndi</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Reviews" level={2} description={reputationLabel(data.reputation)}>
            {data.reviews.isPending ? (
              <SkeletonText lines={3} />
            ) : data.reviews.error ? (
              <ErrorState error={data.reviews.error} compact />
            ) : !data.reviews.data || data.reviews.data.items.length === 0 ? (
              <p className="text-[var(--text-muted)]">No reviews to show yet.</p>
            ) : (
              <ul className="grid gap-3">
                {data.reviews.data.items.map((review) => (
                  <li key={review.reviewId} className="grid gap-1.5 rounded-2xl p-4 ring-1 ring-inset ring-[var(--hairline)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{review.authorName}</span>
                      <span aria-label={`${review.rating} out of 5`} className="text-[var(--tone-warning-fg)]">
                        {'★'.repeat(review.rating)}
                        <span className="text-[var(--hairline-strong)]">{'★'.repeat(5 - review.rating)}</span>
                      </span>
                      <StatusPill tone={review.authenticity === 'verified_booking' ? 'success' : 'neutral'}>{review.authenticity === 'verified_booking' ? 'Verified booking' : 'Unverified review'}</StatusPill>
                    </div>
                    <p>{review.text}</p>
                    <p className="text-[0.8125rem] text-[var(--text-subtle)]">{formatDate(review.createdAt.slice(0, 10))}</p>
                    {review.response && <p className="rounded-xl bg-[var(--tone-neutral-bg)] p-3 text-[0.9375rem]">Response: {review.response.text}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="grid content-start gap-4">
          <section aria-labelledby="evidence-title" className="surface-card grid gap-3 p-5">
            <h2 id="evidence-title" className="font-semibold">
              Verification evidence
            </h2>
            <ul className="grid gap-3">
              {data.verification.map((evidence) => (
                <li key={evidence.kind} className="grid gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{EVIDENCE_LABEL[evidence.kind]}</span>
                    <StatusPill tone={EVIDENCE_STATUS[evidence.status].tone}>{EVIDENCE_STATUS[evidence.status].label}</StatusPill>
                  </div>
                  <span className="text-[0.8125rem] text-[var(--text-muted)]">
                    {[evidence.verifierLabel, evidence.verifiedAt ? `checked ${formatDate(evidence.verifiedAt.slice(0, 10))}` : null, evidence.expiresAt ? `valid until ${formatDate(evidence.expiresAt.slice(0, 10))}` : null, evidence.note]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[0.8125rem] text-[var(--text-muted)]">Verification confirms documents, not the quality of every experience.</p>
          </section>
          {data.availability && (
            <section className="surface-card grid gap-2 p-5">
              <h2 className="font-semibold">Availability</h2>
              <FreshnessBadge freshness={data.availability.freshness} />
            </section>
          )}
          <InlineNotice tone="neutral" title="Something wrong?" action={<ButtonLink href={data.reportHref} variant="secondary" size="sm"><FlagIcon size={16} />Report a problem</ButtonLink>}>
            Never pay in advance to someone who contacts you outside TravIndi claiming to be this provider.
          </InlineNotice>
        </aside>
      </div>

      {booking && <BookingSheet service={booking} providerName={data.name} open onClose={() => setBooking(null)} />}
    </div>
  );
}

function NotFoundState({ label, href }: { label: string; href: string }) {
  return <EmptyState as="h1" title={`We couldn’t find this ${label}`} description="It may no longer be listed." action={<ButtonLink href={href} variant="secondary">Back</ButtonLink>} />;
}

export function GuideProfileScreen({ guideId }: { guideId: string }) {
  const guide = useGuide(guideId);
  const reviews = useGuideReviews(guideId);
  return (
    <PageShell width="wide">
      {guide.isPending ? (
        <LoadingBlock label="Loading guide" className="grid gap-4"><Skeleton className="h-24 w-2/3" /><Skeleton className="h-64 w-full rounded-[1.25rem]" /></LoadingBlock>
      ) : guide.isError ? (
        isApiError(guide.error) && guide.error.kind === 'not_found' ? <NotFoundState label="guide" href="/guides" /> : <ErrorState error={guide.error} onRetry={() => void guide.refetch()} />
      ) : (
        <Profile
          data={{
            backHref: '/guides',
            backLabel: 'All guides',
            name: guide.data.name,
            subtitle: `Guide in ${guide.data.destinationNames.join(', ')}`,
            about: guide.data.bio,
            facts: [
              { term: 'Languages', value: guide.data.languages.join(', ') },
              { term: 'Specialities', value: guide.data.specializations.join(', ') },
              ...(guide.data.yearsExperience ? [{ term: 'Experience', value: `${guide.data.yearsExperience} years` }] : []),
            ],
            verification: guide.data.verification,
            reputation: guide.data.reputation,
            availability: guide.data.availability,
            services: guide.data.services,
            reviews: { data: reviews.data, isPending: reviews.isPending, error: reviews.error },
            reportHref: `/trust/fraud?provider=${encodeURIComponent(guide.data.guideId)}`,
          }}
        />
      )}
    </PageShell>
  );
}

export function BusinessProfileScreen({ businessId }: { businessId: string }) {
  const business = useBusiness(businessId);
  const reviews = useBusinessReviews(businessId);
  return (
    <PageShell width="wide">
      {business.isPending ? (
        <LoadingBlock label="Loading business" className="grid gap-4"><Skeleton className="h-24 w-2/3" /><Skeleton className="h-64 w-full rounded-[1.25rem]" /></LoadingBlock>
      ) : business.isError ? (
        isApiError(business.error) && business.error.kind === 'not_found' ? <NotFoundState label="business" href="/businesses" /> : <ErrorState error={business.error} onRetry={() => void business.refetch()} />
      ) : (
        <Profile
          data={{
            backHref: '/businesses',
            backLabel: 'All businesses',
            name: business.data.name,
            subtitle: `${BUSINESS_CATEGORY[business.data.category]} · ${business.data.destinationName}`,
            about: business.data.description,
            facts: [
              { term: 'Address', value: business.data.address },
              { term: 'Languages', value: business.data.languages.join(', ') },
              ...(business.data.openingHours ? [{ term: 'Hours', value: business.data.openingHours }] : []),
            ],
            verification: business.data.verification,
            reputation: business.data.reputation,
            availability: business.data.availability,
            services: business.data.services,
            reviews: { data: reviews.data, isPending: reviews.isPending, error: reviews.error },
            reportHref: `/trust/fraud?provider=${encodeURIComponent(business.data.businessId)}`,
          }}
        />
      )}
    </PageShell>
  );
}
