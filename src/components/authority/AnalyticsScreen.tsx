'use client';

import { useState } from 'react';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { useAuthorityAnalytics } from '@/lib/query/hooks/authority';
import type { AnalyticsSeries } from '@/types/domain';

function pointLabel(t: string, range: string) {
  const d = new Date(t);
  return range === '24h' ? d.toLocaleTimeString('en-IN', { hour: 'numeric' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Bar chart with its data available as a table for screen readers. */
function SeriesChart({ series, range }: { series: AnalyticsSeries; range: string }) {
  const max = Math.max(1, ...series.points.map((p) => p.value));
  const total = series.points.reduce((sum, p) => sum + p.value, 0);
  const width = 600;
  const height = 160;
  const barWidth = width / series.points.length;

  return (
    <section className="surface-card grid gap-3 p-5" aria-labelledby={`series-${series.metric}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`series-${series.metric}`} className="font-semibold">
          {series.label}
        </h3>
        <p className="text-[0.9375rem] text-[var(--text-muted)]">
          {series.metric === 'active_trips' ? `Latest: ${series.points[series.points.length - 1]?.value ?? 0}` : `Total: ${total}`} {series.unit}
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" aria-hidden="true" preserveAspectRatio="none">
        {series.points.map((point, index) => {
          const h = (point.value / max) * (height - 8);
          return <rect key={point.t} x={index * barWidth + barWidth * 0.15} y={height - h} width={barWidth * 0.7} height={h} rx={2} fill="var(--color-gold)" opacity={0.85} />;
        })}
      </svg>
      <table className="sr-only">
        <caption>{series.label}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">{series.unit}</th>
          </tr>
        </thead>
        <tbody>
          {series.points.map((point) => (
            <tr key={point.t}>
              <td>{pointLabel(point.t, range)}</td>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <FreshnessBadge freshness={series.freshness} />
    </section>
  );
}

export function AnalyticsScreen() {
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d');
  const analytics = useAuthorityAnalytics(range);
  const maxCategory = Math.max(1, ...(analytics.data?.incidentsByCategory ?? []).map((c) => c.count));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.375rem] font-semibold">Analytics</h2>
        <SegmentedControl label="Time range" size="sm" value={range} onChange={setRange} options={[{ value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} />
      </div>
      {analytics.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-60 rounded-[1.25rem]" />
          <Skeleton className="h-60 rounded-[1.25rem]" />
        </div>
      ) : analytics.isError ? (
        <ErrorState error={analytics.error} onRetry={() => void analytics.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {analytics.data.series.map((series) => (
              <SeriesChart key={series.metric} series={series} range={range} />
            ))}
          </div>
          <section className="surface-card grid gap-3 p-5" aria-labelledby="by-category">
            <h3 id="by-category" className="font-semibold">
              Incidents by category
            </h3>
            <ul className="grid gap-2">
              {analytics.data.incidentsByCategory.map((item) => (
                <li key={item.category} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-[0.9375rem]">
                  <span className="capitalize">{item.category.replace('_', ' ')}</span>
                  <span aria-hidden="true" className="h-2.5 rounded-full bg-[var(--color-gold)]" style={{ width: `${(item.count / maxCategory) * 100}%` }} />
                  <span className="text-right tabular-nums">{item.count}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
