'use client';

import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n/react';
import { cn } from '@/utils/cn';

const base =
  'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.875rem] font-medium ring-1 ring-inset transition-colors duration-200';

interface ChipProps {
  children: ReactNode;
  className?: string;
}

/** A static label chip. */
export function Chip({ children, className }: ChipProps) {
  return <span className={cn(base, 'bg-[var(--surface-raised)] text-[var(--text)] ring-[var(--hairline)]', className)}>{children}</span>;
}

interface ToggleChipProps extends ChipProps {
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/** A selectable filter/preference chip, announced as a toggle button. */
export function ToggleChip({ selected, onToggle, disabled, children, className }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        base,
        'tap-target',
        selected
          ? 'bg-[var(--color-navy)] text-[var(--color-ivory)] ring-[var(--color-navy)]'
          : 'bg-[var(--surface-raised)] text-[var(--text)] ring-[var(--hairline-strong)] hover:bg-[var(--surface-sunken)]',
        'disabled:opacity-50',
        className,
      )}
    >
      {selected && <span aria-hidden="true">✓</span>}
      {children}
    </button>
  );
}

interface RemovableChipProps extends ChipProps {
  label: string;
  onRemove: () => void;
  onEdit?: () => void;
  /** e.g. "from your profile" — shown as secondary text. */
  source?: string;
}

/** An extracted value the traveller can edit or remove ("HERE'S WHAT WE UNDERSTOOD"). */
export function RemovableChip({ label, onRemove, onEdit, source, children, className }: RemovableChipProps) {
  const { t } = useTranslation();
  return (
    <span className={cn(base, 'bg-[var(--surface-raised)] pr-1 text-[var(--text)] ring-[var(--hairline-strong)]', className)}>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="rounded-full text-left underline-offset-4 hover:underline" aria-label={t('common.a11y.editValue', { label })}>
          {children}
        </button>
      ) : (
        children
      )}
      {source && <span className="text-[0.75rem] font-normal text-[var(--text-subtle)]">{source}</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('common.a11y.removeValue', { label })}
        className="inline-flex size-7 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--tone-neutral-bg)] hover:text-[var(--text)]"
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}
