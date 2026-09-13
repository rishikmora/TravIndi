'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { Field, Select, Switch, TextInput } from '@/components/ui/Field';
import { UsersIcon } from '@/components/ui/icons';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { StatusPill } from '@/components/ui/StatusPill';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDestinations } from '@/lib/query/hooks/destinations';
import { useBusinesses, useGuides } from '@/lib/query/hooks/providers';
import type { ProviderListQuery } from '@/lib/repositories/providers';
import type { BusinessCategory } from '@/types/api';
import { reputationLabel, verificationSummary } from './trust';

const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Malayalam', 'Urdu', 'French'];

export const BUSINESS_CATEGORY: Record<BusinessCategory, string> = {
  stay: 'Stays',
  restaurant: 'Restaurants',
  tour_operator: 'Tours',
  transport: 'Transport',
  experience: 'Experiences',
  shop: 'Shops',
  wellness: 'Wellness',
};

function Row({ href, name, detail, meta, evidence, reputation }: { href: string; name: string; detail: string; meta: string; evidence: ReturnType<typeof verificationSummary>; reputation: string }) {
  return (
    <li>
      <Link href={href} className="surface-card flex items-start gap-4 p-4 transition-colors hover:bg-[var(--surface-sunken)]">
        <Avatar name={name} size="lg" decorative />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[1.0625rem] font-semibold">{name}</span>
            <StatusPill tone={evidence.tone}>{evidence.label}</StatusPill>
          </div>
          <p className="text-[0.9375rem]">{detail}</p>
          <p className="text-[0.8125rem] text-[var(--text-muted)]">{meta}</p>
          <p className="text-[0.8125rem] text-[var(--text-subtle)]">{reputation}</p>
        </div>
      </Link>
    </li>
  );
}

function GuideResults({ params }: { params: ProviderListQuery }) {
  const guides = useGuides(params);
  if (guides.isPending) return <LoadingBlock label="Loading guides" className="grid gap-3"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-28 w-full rounded-2xl" /></LoadingBlock>;
  if (guides.isError) return <ErrorState error={guides.error} onRetry={() => void guides.refetch()} />;
  if (guides.data.items.length === 0) return <EmptyState icon={<UsersIcon />} title="No guides match" description="Try another destination or language, or turn off “Verified only”." className="surface-card" />;
  return (
    <ul className="grid gap-3" aria-busy={guides.isFetching || undefined}>
      {guides.data.items.map((guide) => (
        <Row
          key={guide.guideId}
          href={`/guides/${guide.guideId}`}
          name={guide.name}
          detail={guide.specializations.join(' · ')}
          meta={`${guide.destinationNames.join(', ')} · ${guide.languages.join(', ')}`}
          evidence={verificationSummary(guide.verification)}
          reputation={reputationLabel(guide.reputation)}
        />
      ))}
    </ul>
  );
}

function BusinessResults({ params }: { params: ProviderListQuery }) {
  const businesses = useBusinesses(params);
  if (businesses.isPending) return <LoadingBlock label="Loading businesses" className="grid gap-3"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-28 w-full rounded-2xl" /></LoadingBlock>;
  if (businesses.isError) return <ErrorState error={businesses.error} onRetry={() => void businesses.refetch()} />;
  if (businesses.data.items.length === 0) return <EmptyState icon={<UsersIcon />} title="No businesses match" description="Try another destination or category, or turn off “Verified only”." className="surface-card" />;
  return (
    <ul className="grid gap-3" aria-busy={businesses.isFetching || undefined}>
      {businesses.data.items.map((business) => (
        <Row
          key={business.businessId}
          href={`/businesses/${business.businessId}`}
          name={business.name}
          detail={business.description}
          meta={`${BUSINESS_CATEGORY[business.category]} · ${business.destinationName}`}
          evidence={verificationSummary(business.verification)}
          reputation={reputationLabel(business.reputation)}
        />
      ))}
    </ul>
  );
}

export function ProviderDirectory({ kind }: { kind: 'guide' | 'business' }) {
  const destinations = useDestinations({ limit: 60 });
  const [text, setText] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [language, setLanguage] = useState('');
  const [category, setCategory] = useState<BusinessCategory | ''>('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const q = useDebouncedValue(text.trim().slice(0, 100), 250);

  const params: ProviderListQuery = {
    q: q || undefined,
    destinationId: destinationId || undefined,
    language: language || undefined,
    category: kind === 'business' && category ? category : undefined,
    verifiedOnly: verifiedOnly || undefined,
  };

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Discover"
        title={kind === 'guide' ? 'Local guides' : 'Local businesses'}
        description="Verification is shown as the evidence TravIndi holds — check it before you book or pay."
      />
      <div className="grid gap-6">
        <div className="surface-card grid gap-4 p-5 md:grid-cols-2">
          <Field label="Search">
            {(control) => <TextInput {...control} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'guide' ? 'Name or speciality' : 'Name or what they offer'} />}
          </Field>
          <Field label="Destination">
            {(control) => (
              <Select {...control} value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                <option value="">Anywhere</option>
                {(destinations.data?.items ?? []).map((d) => (
                  <option key={d.destinationId} value={d.destinationId}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {kind === 'guide' ? (
            <Field label="Language">
              {(control) => (
                <Select {...control} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="">Any language</option>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Category">
              {(control) => (
                <Select {...control} value={category} onChange={(e) => setCategory(e.target.value as BusinessCategory | '')}>
                  <option value="">All categories</option>
                  {Object.entries(BUSINESS_CATEGORY).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Switch label="Verified only" description="Identity and registration or licence checked." checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="md:self-end md:pb-1" />
        </div>
        {kind === 'guide' ? <GuideResults params={params} /> : <BusinessResults params={params} />}
      </div>
    </PageShell>
  );
}
