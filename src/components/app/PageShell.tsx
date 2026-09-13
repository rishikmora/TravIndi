import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

const WIDTHS = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
} as const;

interface PageShellProps {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  /** `dark` (deep navy) suits night use, SOS and operational dashboards. */
  tone?: 'light' | 'dark';
  className?: string;
}

/** Product page surface: heritage ivory (or navy), clears the fixed navigation. */
export function PageShell({ children, width = 'default', tone = 'light', className }: PageShellProps) {
  return (
    <div
      className={cn(tone === 'dark' ? 'theme-app-dark' : 'theme-app', 'min-h-[100dvh] pb-16 pt-[calc(var(--nav-height)+1.75rem)]')}
      data-nav-theme={tone === 'dark' ? 'dark' : 'light'}
    >
      <div className={cn('mx-auto w-full page-gutter', WIDTHS[width], className)}>{children}</div>
    </div>
  );
}

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between', className)}>
      <div className="grid min-w-0 gap-2">
        {eyebrow && <p className="label text-[var(--text-subtle)]">{eyebrow}</p>}
        <h1 className="text-balance text-[clamp(1.875rem,4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em]">{title}</h1>
        {description && <p className="max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-[var(--text-muted)]">{description}</p>}
        {meta}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

interface SectionProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Heading level within the page outline. */
  level?: 2 | 3;
}

export function Section({ title, description, action, children, className, id, level = 2 }: SectionProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn('grid gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <Heading id={id ? `${id}-title` : undefined} className={cn('font-semibold tracking-[-0.02em]', level === 2 ? 'text-[1.375rem]' : 'text-[1.125rem]')}>
            {title}
          </Heading>
          {description && <p className="text-[0.9375rem] text-[var(--text-muted)]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
