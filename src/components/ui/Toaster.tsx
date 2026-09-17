'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/react';
import { type ToastItem, useToastStore } from '@/lib/ui/toast';
import { cn } from '@/utils/cn';
import { CloseIcon } from './icons';

const TONE_CLASS: Record<ToastItem['tone'], string> = {
  info: 'before:bg-[var(--color-info)]',
  success: 'before:bg-[var(--color-success)]',
  warning: 'before:bg-[var(--color-saffron-muted)]',
  danger: 'before:bg-[var(--color-danger)]',
};

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration ?? (item.tone === 'danger' || item.action ? 10_000 : 6000));

  useEffect(() => {
    if (paused || remaining.current === 0) return;
    const started = Date.now();
    const timer = setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(1000, remaining.current - (Date.now() - started));
    };
  }, [paused, dismiss, item.id]);

  return (
    <li
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'theme-app-dark pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl py-3.5 pl-5 pr-2 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.6)]',
        'before:absolute before:inset-y-0 before:left-0 before:w-1.5',
        'animate-[rise-in_260ms_var(--ease-cinematic)]',
        TONE_CLASS[item.tone],
      )}
    >
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-[0.9375rem] font-semibold">{item.title}</p>
        {item.description && <p className="text-[0.875rem] leading-snug text-[var(--text-muted)]">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismiss(item.id);
            }}
            className="mt-1 justify-self-start rounded-full text-[0.875rem] font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label={t('common.a11y.dismissNotification')}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--tone-neutral-bg)]"
      >
        <CloseIcon size={16} />
      </button>
    </li>
  );
}

/** Toast stack plus the app's screen-reader live regions. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const polite = useToastStore((s) => s.polite);
  const assertive = useToastStore((s) => s.assertive);
  const { t } = useTranslation();

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" className="sr-only">
        {assertive}
      </div>
      <section
        aria-label={t('common.labels.notifications')}
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-6 md:left-auto md:right-6 md:justify-end"
      >
        <ol aria-live="polite" className="grid w-full max-w-sm gap-2">
          {toasts.map((item) => (
            <ToastCard key={item.id} item={item} />
          ))}
        </ol>
      </section>
    </>
  );
}
