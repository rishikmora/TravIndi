import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import { cn } from '@/utils/cn';

/**
 * `primary`, `glass`, `ink`, `outline` and `ghost` serve the cinematic journey.
 * `accent`, `navy`, `secondary`, `subtle` and `danger` serve product surfaces.
 */
export type ButtonVariant = 'primary' | 'glass' | 'ink' | 'outline' | 'ghost' | 'accent' | 'navy' | 'secondary' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-paper text-ink shadow-[0_12px_32px_-14px_rgb(0_0_0/0.55)] hover:bg-white',
  glass: 'bg-white/[0.08] text-paper ring-1 ring-inset ring-white/20 backdrop-blur-md hover:bg-white/[0.15]',
  ink: 'bg-ink text-paper hover:bg-ink-3',
  outline: 'text-[var(--text)] ring-1 ring-inset ring-[var(--hairline)] hover:bg-[var(--hairline)]',
  ghost: 'text-[var(--text)] hover:bg-[var(--hairline)]',
  accent: 'bg-terracotta text-[#fffdf8] shadow-[0_12px_28px_-16px_rgb(168_74_42/0.85)] hover:bg-terracotta-2',
  navy: 'bg-navy text-ivory hover:bg-navy-3',
  secondary: 'bg-[var(--surface-raised)] text-[var(--text)] ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-[var(--surface-sunken)]',
  subtle: 'bg-[var(--tone-neutral-bg)] text-[var(--text)] hover:bg-[var(--hairline)]',
  danger: 'bg-danger text-white shadow-[0_12px_28px_-16px_rgb(179_38_30/0.8)] hover:bg-[#961f18]',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[0.8125rem]',
  md: 'h-11 px-5 text-[0.9375rem]',
  lg: 'h-13 px-7 text-base',
};

const iconSizes: Record<ButtonSize, string> = {
  sm: 'size-9',
  md: 'size-11',
  lg: 'size-13',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string, iconOnly = false) {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.01em]',
    'transition-[transform,background-color,box-shadow,color,opacity] duration-300 ease-cinematic',
    'hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variants[variant],
    iconOnly ? iconSizes[size] : sizes[size],
    className,
  );
}

type LinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean };

export function ButtonLink({ variant, size, iconOnly, className, ...props }: LinkProps) {
  return <Link className={buttonClass(variant, size, className, iconOnly)} {...props} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square button; requires an `aria-label`. */
  iconOnly?: boolean;
  /** Shows progress and prevents repeat submission. The label stays visible. */
  loading?: boolean;
};

export function Button({ variant, size, iconOnly, loading, className, type = 'button', disabled, children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className, iconOnly)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
