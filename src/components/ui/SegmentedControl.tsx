'use client';

import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cn } from '@/utils/cn';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: Array<Option<T>>;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/** A radio group styled as segments; arrow keys move and select. */
export function SegmentedControl<T extends string>({ label, value, options, onChange, className, size = 'md' }: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.filter((o) => !o.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = enabled.findIndex((o) => o.value === value);
    const last = enabled.length - 1;
    const nextIndex =
      event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (current + 1) % enabled.length : (current - 1 + enabled.length) % enabled.length;
    const next = enabled[nextIndex];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-full bg-[var(--tone-neutral-bg)] p-1 ring-1 ring-inset ring-[var(--hairline)]', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
            className={cn(
              'rounded-full font-medium transition-colors duration-200 disabled:opacity-40',
              size === 'sm' ? 'min-h-8 px-3 text-[0.8125rem]' : 'min-h-10 px-4 text-[0.9375rem]',
              checked ? 'bg-[var(--surface-raised)] text-[var(--text)] shadow-sm ring-1 ring-[var(--hairline)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
