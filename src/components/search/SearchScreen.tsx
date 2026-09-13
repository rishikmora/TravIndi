'use client';

import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import { PageShell } from '@/components/app/PageShell';
import { SearchIcon } from '@/components/ui/icons';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearch } from '@/lib/query/hooks/destinations';
import type { SearchResultType } from '@/types/api';
import type { SearchResult } from '@/types/domain';
import { cn } from '@/utils/cn';

const FILTERS: Array<{ value: 'all' | SearchResultType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'destination', label: 'Destinations' },
  { value: 'attraction', label: 'Places' },
  { value: 'guide', label: 'Guides' },
  { value: 'business', label: 'Businesses' },
];

const GROUP_LABEL: Record<SearchResultType, string> = {
  destination: 'Destinations',
  attraction: 'Places to visit',
  experience: 'Experiences',
  guide: 'Local guides',
  business: 'Local businesses',
};

const POPULAR = ['Hyderabad', 'Jaipur', 'Varanasi', 'Kochi', 'Leh'];

const hrefFor = (result: SearchResult) => `/${result.path.map((segment) => encodeURIComponent(segment)).join('/')}`;

export function SearchScreen({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [text, setText] = useState(initialQuery);
  const [filter, setFilter] = useState<'all' | SearchResultType>('all');
  const [active, setActive] = useState(-1);
  const q = useDebouncedValue(text.trim().slice(0, 100), 250);
  const search = useSearch(q, filter === 'all' ? undefined : [filter]);
  const id = useId();
  const listId = `${id}-results`;

  useEffect(() => {
    const url = q ? `/search?q=${encodeURIComponent(q)}` : '/search';
    window.history.replaceState(null, '', url);
    setActive(-1);
  }, [q]);

  const results = useMemo(() => (q.length >= 2 ? (search.data?.results ?? []) : []), [q, search.data]);
  const groups = useMemo(() => {
    const order: SearchResultType[] = ['destination', 'attraction', 'experience', 'guide', 'business'];
    return order.map((type) => ({ type, items: results.filter((r) => r.resultType === type) })).filter((g) => g.items.length > 0);
  }, [results]);
  const flat = groups.flatMap((g) => g.items);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (event.key === 'Enter' && active >= 0 && flat[active]) {
      event.preventDefault();
      router.push(hrefFor(flat[active]));
    } else if (event.key === 'Escape') {
      setText('');
    }
  };

  const showResults = q.length >= 2;

  return (
    <PageShell width="default">
      <div className="grid gap-6">
        <h1 className="text-[clamp(1.875rem,4vw,2.75rem)] font-semibold tracking-[-0.03em]">Search</h1>
        <div className="relative">
          <SearchIcon size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
          <label htmlFor={`${id}-input`} className="sr-only">
            Search destinations, places, guides and businesses
          </label>
          <input
            id={`${id}-input`}
            type="search"
            role="combobox"
            aria-expanded={showResults && flat.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && flat[active] ? `${id}-option-${active}` : undefined}
            autoFocus
            autoComplete="off"
            maxLength={100}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Try “Charminar”, “Kerala” or “food walk”"
            className="h-14 w-full rounded-full bg-[var(--surface-raised)] pl-12 pr-5 text-[1.125rem] shadow-sm ring-1 ring-inset ring-[var(--hairline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
        </div>
        <SegmentedControl label="Search in" value={filter} onChange={setFilter} options={FILTERS} size="sm" className="justify-self-start" />

        <p role="status" aria-live="polite" className="sr-only">
          {showResults && !search.isFetching ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : ''}
        </p>

        {!showResults ? (
          <div className="grid gap-3">
            <p className="text-[var(--text-muted)]">Search destinations, places to visit, local guides and businesses.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Popular searches">
              {POPULAR.map((name) => (
                <button key={name} type="button" onClick={() => setText(name)} className="rounded-full bg-[var(--surface-raised)] px-4 py-2 text-[0.9375rem] ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-[var(--surface-sunken)]">
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : search.isError ? (
          <ErrorState error={search.error} context="search" onRetry={() => void search.refetch()} />
        ) : search.isPending ? (
          <div className="grid gap-2" aria-hidden="true">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : flat.length === 0 ? (
          <div className="surface-card grid gap-3 p-6">
            <p className="text-[1.125rem] font-semibold">No results for “{q}”</p>
            {search.data?.suggestions.length ? (
              <p>
                Did you mean{' '}
                {search.data.suggestions.map((suggestion, index) => (
                  <span key={suggestion}>
                    {index > 0 && ', '}
                    <button type="button" onClick={() => setText(suggestion)} className="font-semibold text-[var(--link)] underline underline-offset-4">
                      {suggestion}
                    </button>
                  </span>
                ))}
                ?
              </p>
            ) : (
              <p className="text-[var(--text-muted)]">Check the spelling, try a nearby city, or search for a kind of place like “temples” or “beaches”.</p>
            )}
          </div>
        ) : (
          <div id={listId} role="listbox" aria-label="Search results" className={cn('grid gap-6', search.isFetching && 'opacity-70')}>
            {groups.map((group) => (
              <div key={group.type} role="group" aria-labelledby={`${id}-group-${group.type}`} className="grid gap-2">
                <p id={`${id}-group-${group.type}`} role="presentation" className="label text-[var(--text-subtle)]">
                  {GROUP_LABEL[group.type]}
                </p>
                <div className="surface-card divide-y divide-[var(--hairline)] overflow-hidden">
                  {group.items.map((result) => {
                    const index = flat.indexOf(result);
                    return (
                      <div
                        key={`${result.resultType}-${result.id}`}
                        id={`${id}-option-${index}`}
                        role="option"
                        aria-selected={index === active}
                        tabIndex={-1}
                        onClick={() => router.push(hrefFor(result))}
                        onMouseEnter={() => setActive(index)}
                        className={cn('grid cursor-pointer gap-0.5 px-4 py-3', index === active ? 'bg-[var(--tone-accent-bg)]' : 'hover:bg-[var(--surface-sunken)]')}
                      >
                        <span className="font-medium">{result.title}</span>
                        <span className="text-[0.875rem] text-[var(--text-muted)]">{result.subtitle}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
