'use client';

import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { formatLocalTime } from '@/lib/format/dates';
import type { AdaptationChange } from '@/types/domain';
import { cn } from '@/utils/cn';
import { CHANGE_TYPE } from './vocabulary';

function timeRange(ref: AdaptationChange['before']) {
  if (!ref?.startTime) return null;
  return [formatLocalTime(ref.startTime), formatLocalTime(ref.endTime)].filter(Boolean).join('–');
}

/** UNCHANGED · MOVED · REMOVED · ADDED, grouped by day, in plan order. */
export function ChangeDiff({ changes, showUnchanged = true, className }: { changes: AdaptationChange[]; showUnchanged?: boolean; className?: string }) {
  const { t } = useTranslation();
  const visible = showUnchanged ? changes : changes.filter((c) => c.changeType !== 'unchanged');
  const days = [...new Set(visible.map((c) => c.dayNumber))].sort((a, b) => a - b);

  return (
    <div className={cn('grid gap-5', className)}>
      {days.map((day) => (
        <section key={day} aria-label={t('adaptation.diff.dayChanges', { day })} className="grid gap-2">
          <h4 className="label text-[var(--text-subtle)]">{t('itinerary.view.day', { day })}</h4>
          <ol className="grid gap-2">
            {visible
              .filter((c) => c.dayNumber === day)
              .map((change) => {
                const meta = CHANGE_TYPE[change.changeType];
                const ref = change.after ?? change.before;
                const beforeTime = timeRange(change.before);
                const afterTime = timeRange(change.after);
                return (
                  <li
                    key={change.changeId}
                    className={cn(
                      'grid gap-1 rounded-2xl p-3 ring-1 ring-inset',
                      change.changeType === 'added' && 'bg-[var(--tone-success-bg)] ring-transparent',
                      change.changeType === 'removed' && 'bg-[var(--tone-danger-bg)] ring-transparent',
                      change.changeType === 'moved' && 'bg-[var(--tone-info-bg)] ring-transparent',
                      change.changeType === 'unchanged' && 'ring-[var(--hairline)]',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                      <span className={cn('text-[0.875rem] tabular-nums text-[var(--text-muted)]')}>
                        {change.changeType === 'moved' && beforeTime && afterTime ? (
                          <>
                            <span className="line-through">{beforeTime}</span> → {afterTime}
                          </>
                        ) : (
                          (afterTime ?? beforeTime)
                        )}
                      </span>
                    </div>
                    <p className={cn('font-medium', change.changeType === 'removed' && 'line-through decoration-[var(--tone-danger-fg)]')}>{ref?.title}</p>
                    {change.reasons.length > 0 && change.changeType !== 'unchanged' && (
                      <p className="text-[0.875rem] text-[var(--text-muted)]">{change.reasons.map((r) => r.label).join(' · ')}</p>
                    )}
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}
