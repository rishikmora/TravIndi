'use client';

import Link from 'next/link';
import { Dialog } from '@/components/ui/Dialog';
import { InlineNotice } from '@/components/ui/States';
import { formatLocalTime } from '@/lib/format/dates';
import { describeCost } from '@/lib/format/money';
import type { ItineraryItem } from '@/types/domain';
import { stepFreeLabel, travelLegLabel, WALKING_LABEL } from './itemVocabulary';

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-[var(--hairline)] py-3 last:border-0">
      <dt className="label text-[var(--text-subtle)]">{term}</dt>
      <dd className="text-[0.9375rem]">{children}</dd>
    </div>
  );
}

/** "Why this?" — the backend's short reasons and everything known (and not known) about a stop. */
export function ItemDetailSheet({ item, tripId, onClose }: { item: ItineraryItem | null; tripId: string; onClose: () => void }) {
  const cost = item ? describeCost(item.cost) : null;
  const time = item ? [formatLocalTime(item.startTime), formatLocalTime(item.endTime)].filter(Boolean).join('–') : '';

  return (
    <Dialog open={Boolean(item)} onClose={onClose} variant="sheet" title={item?.title ?? ''} description={item ? [item.category, time].filter(Boolean).join(' · ') : undefined}>
      {item && cost && (
        <div className="grid gap-4 pb-2">
          <section aria-labelledby="why-title" className="grid gap-2 rounded-2xl bg-[var(--tone-accent-bg)] p-4">
            <h3 id="why-title" className="font-semibold">
              Why this is in your plan
            </h3>
            {item.reasons.length > 0 ? (
              <ul className="grid gap-1.5">
                {item.reasons.map((reason) => (
                  <li key={reason.code} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-terracotta" />
                    {reason.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--text-muted)]">No specific reason was recorded for this stop.</p>
            )}
          </section>

          <dl>
            {item.description && <Row term="About">{item.description}</Row>}
            {item.travelFromPrevious && <Row term="Getting there">{travelLegLabel(item.travelFromPrevious)} from the previous stop (estimate)</Row>}
            {item.accessibility && (
              <Row term="Access">
                {[item.accessibility.walkingLevel ? WALKING_LABEL[item.accessibility.walkingLevel] : 'Walking level not confirmed', stepFreeLabel(item.accessibility.stepFree)].join(' · ')}
                {item.accessibility.notes && <p className="mt-1 text-[var(--text-muted)]">{item.accessibility.notes}</p>}
              </Row>
            )}
            <Row term="Cost">
              <span className={cost.status === 'unavailable' ? 'italic' : 'font-medium'}>{cost.label}</span>
              {cost.status === 'estimate' && <span className="text-[var(--text-muted)]"> · Estimate</span>}
              {cost.note && cost.status !== 'estimate' && <span className="text-[var(--text-muted)]"> · {cost.note}</span>}
              {cost.status === 'unavailable' && <p className="mt-1 text-[0.875rem] text-[var(--text-muted)]">We don’t have reliable price information for this stop, so it isn’t counted in your budget.</p>}
            </Row>
          </dl>

          {item.safetyNote && <InlineNotice tone="warning" title="Safety note">{item.safetyNote}</InlineNotice>}

          {item.place?.coordinates && (
            <Link href={`/trips/${tripId}/map?place=${encodeURIComponent(item.place.placeId)}`} className="justify-self-start rounded-full text-[0.9375rem] font-semibold text-[var(--link)] underline underline-offset-4">
              See on the trip map
            </Link>
          )}
        </div>
      )}
    </Dialog>
  );
}
