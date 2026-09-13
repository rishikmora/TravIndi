'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToggleChip } from '@/components/ui/Chip';
import { Field, Select, Switch, TextInput } from '@/components/ui/Field';
import { CompassIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import type { DestinationListQuery } from '@/lib/repositories/destinations';
import type { DestinationCategory } from '@/types/api';
import type { DestinationSummary, Page } from '@/types/domain';
import { CATEGORY_LABEL, DestinationCard } from './DestinationCard';

const REGIONS = ['North', 'West', 'South', 'East', 'Northeast', 'Central', 'Islands'];

export function DestinationsExplorer({ initial }: { initial: Page<DestinationSummary> }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<DestinationCategory | null>(null);
  const [region, setRegion] = useState('');
  const [hiddenGems, setHiddenGems] = useState(false);
  const q = useDebouncedValue(text.trim().slice(0, 100), 250);

  const params: DestinationListQuery = { q: q || undefined, category: category ?? undefined, region: region || undefined, hiddenGems: hiddenGems || undefined, limit: 60 };
  const isDefault = !q && !category && !region && !hiddenGems;

  const list = useQuery({
    queryKey: queryKeys.destinations.list({ ...params }),
    queryFn: ({ signal }) => api.destinations.list(params, { signal }),
    initialData: isDefault ? initial : undefined,
    staleTime: 10 * 60_000,
  });

  const reset = () => {
    setText('');
    setCategory(null);
    setRegion('');
    setHiddenGems(false);
  };

  const items = list.data?.items ?? [];

  return (
    <div className="grid gap-8">
      <div className="surface-card grid gap-5 p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_14rem_auto] md:items-end">
          <Field label="Search destinations">
            {(control) => <TextInput {...control} type="search" placeholder="A city, state or kind of place" value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <Field label="Region">
            {(control) => (
              <Select {...control} value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">All regions</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Switch label="Hidden gems" checked={hiddenGems} onChange={(e) => setHiddenGems(e.target.checked)} className="md:pb-2" />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of place">
          {(Object.keys(CATEGORY_LABEL) as DestinationCategory[]).map((value) => (
            <ToggleChip key={value} selected={category === value} onToggle={() => setCategory(category === value ? null : value)}>
              {CATEGORY_LABEL[value]}
            </ToggleChip>
          ))}
        </div>
      </div>

      <p role="status" aria-live="polite" className="text-[0.9375rem] text-[var(--text-muted)]">
        {list.isFetching && !list.data ? 'Finding destinations…' : `${list.data?.total ?? items.length} destination${(list.data?.total ?? items.length) === 1 ? '' : 's'}`}
      </p>

      {list.isError ? (
        <ErrorState error={list.error} context="search" onRetry={() => void list.refetch()} />
      ) : items.length === 0 && !list.isFetching ? (
        <EmptyState
          icon={<CompassIcon />}
          title="No destinations match"
          description="Try a different region or kind of place."
          action={
            <Button variant="secondary" onClick={reset}>
              Clear filters
            </Button>
          }
          className="surface-card"
        />
      ) : (
        <ul className="grid gap-4 xs:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" aria-busy={list.isFetching || undefined}>
          {items.map((destination, index) => (
            <li key={destination.destinationId} className="flex">
              <DestinationCard destination={destination} className="w-full" priority={index < 4} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
