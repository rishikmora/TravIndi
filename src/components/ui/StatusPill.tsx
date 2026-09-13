import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'live';

const tones: Record<Tone, string> = {
  neutral: 'bg-[var(--tone-neutral-bg)] text-[var(--tone-neutral-fg)]',
  info: 'bg-[var(--tone-info-bg)] text-[var(--tone-info-fg)]',
  success: 'bg-[var(--tone-success-bg)] text-[var(--tone-success-fg)]',
  warning: 'bg-[var(--tone-warning-bg)] text-[var(--tone-warning-fg)]',
  danger: 'bg-[var(--tone-danger-bg)] text-[var(--tone-danger-fg)]',
  accent: 'bg-[var(--tone-accent-bg)] text-[var(--tone-accent-fg)]',
  live: 'bg-[var(--tone-success-bg)] text-[var(--tone-success-fg)]',
};

interface StatusPillProps {
  tone?: Tone;
  children: ReactNode;
  /** Leading dot; pulses for `live` (static under reduced motion). */
  dot?: boolean;
  className?: string;
  title?: string;
}

/** Uppercase status label. Text always carries the meaning; colour only reinforces it. */
export function StatusPill({ tone = 'neutral', children, dot = tone === 'live', className, title }: StatusPillProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em]',
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full bg-current', tone === 'live' && 'animate-[pulse-soft_1.6s_ease-in-out_infinite]')}
        />
      )}
      {children}
    </span>
  );
}
