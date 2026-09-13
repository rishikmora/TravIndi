'use client';

import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';
import { cn } from '@/utils/cn';

interface ControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Shows "(optional)" — most trip fields are optional by design. */
  optional?: boolean;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}

/** Label, hint and error wired to a single control through ids. */
export function Field({ label, hint, error, required, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-[0.9375rem] font-medium text-[var(--text)]">
        {label}
        {optional && <span className="ml-1.5 font-normal text-[var(--text-subtle)]">(optional)</span>}
        {required && <span aria-hidden="true" className="ml-1 text-[var(--color-danger)]">*</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-[0.8125rem] leading-snug text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-[0.8125rem] font-medium text-[var(--tone-danger-fg)]">
          <span aria-hidden="true">!</span>
          {error}
        </p>
      )}
    </div>
  );
}

export const controlClass = (className?: string) =>
  cn(
    'tap-target w-full rounded-xl bg-[var(--surface-raised)] px-3.5 text-[1rem] text-[var(--text)] ring-1 ring-inset ring-[var(--hairline-strong)]',
    'placeholder:text-[var(--text-subtle)] transition-shadow duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
    'aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-[var(--color-danger)]',
    'disabled:cursor-not-allowed disabled:opacity-60',
    className,
  );

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={controlClass(cn('h-11', className))} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={controlClass(cn('min-h-28 py-3 leading-relaxed', className))} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={controlClass(cn('h-11 appearance-none bg-no-repeat pr-9', className))} {...props}>
      {children}
    </select>
  );
}

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, className, id: givenId, ...props }: ToggleProps) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-[var(--color-teal)]"
        aria-describedby={description ? `${id}-desc` : undefined}
        {...props}
      />
      <label htmlFor={id} className="grid gap-0.5 text-[0.9375rem]">
        <span className="font-medium">{label}</span>
        {description && (
          <span id={`${id}-desc`} className="text-[0.8125rem] text-[var(--text-muted)]">
            {description}
          </span>
        )}
      </label>
    </div>
  );
}

/** An on/off switch; announced as a switch with its checked state. */
export function Switch({ label, description, className, id: givenId, ...props }: ToggleProps) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <label htmlFor={id} className="grid gap-0.5 text-[0.9375rem]">
        <span className="font-medium">{label}</span>
        {description && (
          <span id={`${id}-desc`} className="text-[0.8125rem] text-[var(--text-muted)]">
            {description}
          </span>
        )}
      </label>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-describedby={description ? `${id}-desc` : undefined}
          className="peer tap-target absolute inset-0 m-auto h-full w-full cursor-pointer opacity-0"
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none h-7 w-12 rounded-full bg-[var(--hairline-strong)] transition-colors peer-checked:bg-[var(--color-teal)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--focus)] peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
        />
      </span>
    </div>
  );
}
