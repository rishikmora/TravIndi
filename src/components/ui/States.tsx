'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { describeError, type ErrorContext } from '@/lib/api/error-messages';
import { useTranslation } from '@/i18n/react';
import { isApiError } from '@/lib/api/errors';
import { cn } from '@/utils/cn';
import { Button, ButtonLink } from './Button';
import { AlertIcon, InfoIcon, WifiOffIcon } from './icons';
import type { Tone } from './StatusPill';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  /** Heading level for the title, to fit the page outline. */
  as?: 'h1' | 'h2' | 'h3';
}

/** Explains why nothing is here and what to do next. Never a dead end. */
export function EmptyState({ title, description, action, icon, className, as: Heading = 'h2' }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      {icon && <div className="flex size-12 items-center justify-center rounded-full bg-[var(--tone-neutral-bg)] text-[var(--text-muted)]">{icon}</div>}
      <Heading className="text-[1.125rem] font-semibold tracking-[-0.015em]">{title}</Heading>
      {description && <p className="max-w-md text-pretty text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  context?: ErrorContext;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
  /** Use `assertive` only for errors caused by an action the user just took. */
  politeness?: 'polite' | 'assertive';
}

/** Human error message with a recovery path, derived from the normalised API error. */
export function ErrorState({ error, context = 'generic', onRetry, retrying, className, compact, politeness = 'polite' }: ErrorStateProps) {
  const pathname = usePathname();
  const { t, locale } = useTranslation();
  const described = describeError(error, context, locale);
  const offline = isApiError(error) && (error.kind === 'network' || error.kind === 'timeout');
  const Icon = offline ? WifiOffIcon : AlertIcon;

  return (
    <div
      role={politeness === 'assertive' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-2xl bg-[var(--tone-danger-bg)] text-[var(--text)]',
        offline && 'bg-[var(--tone-warning-bg)]',
        compact ? 'items-start p-3.5' : 'flex-col items-center px-6 py-10 text-center',
        className,
      )}
    >
      <Icon size={compact ? 20 : 28} className={cn('shrink-0', offline ? 'text-[var(--tone-warning-fg)]' : 'text-[var(--tone-danger-fg)]')} />
      <div className={cn('grid gap-1', !compact && 'justify-items-center')}>
        <p className="font-semibold">{described.title}</p>
        <p className="max-w-md text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">{described.message}</p>
        {described.stillAvailable && <p className="text-[0.875rem] text-[var(--text-muted)]">{described.stillAvailable}</p>}
        <div className={cn('mt-2 flex flex-wrap gap-2', !compact && 'justify-center')}>
          {described.actions.includes('retry') && onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
              {t('common.actions.tryAgain')}
            </Button>
          )}
          {described.actions.includes('sign_in') && (
            <ButtonLink href={`/login?next=${encodeURIComponent(pathname)}`} variant="navy" size="sm">
              {t('common.actions.signIn')}
            </ButtonLink>
          )}
          {described.actions.includes('go_back') && !compact && (
            <Button variant="subtle" size="sm" onClick={() => window.history.back()}>
              {t('common.actions.goBack')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const NOTICE_TONES: Record<Exclude<Tone, 'live' | 'accent'>, string> = {
  neutral: 'bg-[var(--tone-neutral-bg)]',
  info: 'bg-[var(--tone-info-bg)]',
  success: 'bg-[var(--tone-success-bg)]',
  warning: 'bg-[var(--tone-warning-bg)]',
  danger: 'bg-[var(--tone-danger-bg)]',
};

interface InlineNoticeProps {
  tone?: keyof typeof NOTICE_TONES;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** A short explanation next to the content it concerns ("Cost unavailable", "Approximate route"). */
export function InlineNotice({ tone = 'info', title, children, action, icon, className }: InlineNoticeProps) {
  return (
    <div role="note" className={cn('flex items-start gap-3 rounded-2xl p-3.5 text-[0.9375rem]', NOTICE_TONES[tone], className)}>
      <span className="mt-0.5 shrink-0 text-[var(--text-muted)]">{icon ?? <InfoIcon size={18} />}</span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed text-[var(--text-muted)]">{children}</div>}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
    </div>
  );
}
