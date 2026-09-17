'use client';

import Link from 'next/link';
import { Dialog } from '@/components/ui/Dialog';
import { InlineNotice } from '@/components/ui/States';
import { useTranslation } from '@/i18n/react';
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
  const { t } = useTranslation();
  const cost = item ? describeCost(item.cost) : null;
  const time = item ? [formatLocalTime(item.startTime), formatLocalTime(item.endTime)].filter(Boolean).join('–') : '';

  return (
    <Dialog open={Boolean(item)} onClose={onClose} variant="sheet" title={item?.title ?? ''} description={item ? [item.category, time].filter(Boolean).join(' · ') : undefined}>
      {item && cost && (
        <div className="grid gap-4 pb-2">
          <section aria-labelledby="why-title" className="grid gap-2 rounded-2xl bg-[var(--tone-accent-bg)] p-4">
            <h3 id="why-title" className="font-semibold">
              {t('itinerary.detail.whyTitle')}
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
              <p className="text-[var(--text-muted)]">{t('itinerary.detail.noReason')}</p>
            )}
          </section>

          <dl>
            {item.description && <Row term={t('itinerary.detail.about')}>{item.description}</Row>}
            {item.travelFromPrevious && (
              <Row term={t('itinerary.detail.gettingThere')}>{t('itinerary.detail.fromPreviousEstimate', { leg: travelLegLabel(item.travelFromPrevious) ?? '' })}</Row>
            )}
            {item.accessibility && (
              <Row term={t('itinerary.detail.access')}>
                {[item.accessibility.walkingLevel ? WALKING_LABEL[item.accessibility.walkingLevel] : t('itinerary.detail.walkingUnknown'), stepFreeLabel(item.accessibility.stepFree)].join(' · ')}
                {item.accessibility.notes && <p className="mt-1 text-[var(--text-muted)]">{item.accessibility.notes}</p>}
              </Row>
            )}
            <Row term={t('itinerary.detail.cost')}>
              <span className={cost.status === 'unavailable' ? 'italic' : 'font-medium'}>{cost.label}</span>
              {cost.status === 'estimate' && <span className="text-[var(--text-muted)]"> · {t('itinerary.detail.estimate')}</span>}
              {cost.note && cost.status !== 'estimate' && <span className="text-[var(--text-muted)]"> · {cost.note}</span>}
              {cost.status === 'unavailable' && <p className="mt-1 text-[0.875rem] text-[var(--text-muted)]">{t('itinerary.detail.noPrice')}</p>}
            </Row>
          </dl>

          {item.safetyNote && (
            <InlineNotice tone="warning" title={t('itinerary.detail.safetyNote')}>
              {item.safetyNote}
            </InlineNotice>
          )}

          {item.place?.coordinates && (
            <Link href={`/trips/${tripId}/map?place=${encodeURIComponent(item.place.placeId)}`} className="justify-self-start rounded-full text-[0.9375rem] font-semibold text-[var(--link)] underline underline-offset-4">
              {t('itinerary.detail.seeOnMap')}
            </Link>
          )}
        </div>
      )}
    </Dialog>
  );
}
