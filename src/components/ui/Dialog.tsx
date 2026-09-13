'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '@/utils/cn';
import { CloseIcon } from './icons';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** `modal` is centred; `sheet` is a bottom sheet on phones and a side drawer on larger screens. */
  variant?: 'modal' | 'sheet';
  size?: 'sm' | 'md' | 'lg';
  /** When false, Escape and backdrop clicks do nothing (e.g. while a request is in flight). */
  dismissible?: boolean;
  /** Visual tone for safety-critical confirmations. */
  tone?: 'default' | 'danger';
  className?: string;
}

/**
 * Built on the native <dialog> element: focus is trapped and the page behind
 * is inert while open. Focus returns to the element that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
  size = 'md',
  dismissible = true,
  tone = 'default',
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      document.documentElement.style.setProperty('overflow', 'hidden');
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClosed = () => {
      document.documentElement.style.removeProperty('overflow');
      returnFocus.current?.focus();
    };
    dialog.addEventListener('close', onClosed);
    return () => dialog.removeEventListener('close', onClosed);
  }, []);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('overflow');
    },
    [],
  );

  const widths = { sm: 'md:max-w-sm', md: 'md:max-w-lg', lg: 'md:max-w-2xl' } as const;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-lenis-prevent
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={cn(
        'theme-app m-0 max-h-none max-w-none bg-transparent p-0 text-[var(--text)] backdrop:bg-[rgb(20_33_61/0.55)] backdrop:backdrop-blur-[2px]',
        variant === 'modal'
          ? 'fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-lg'
          : 'fixed inset-x-0 bottom-0 top-auto w-full md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-w-md',
        variant === 'modal' && widths[size],
      )}
    >
      {open && (
        <div
          className={cn(
            'flex max-h-[min(90dvh,48rem)] flex-col overflow-hidden bg-[var(--surface-raised)] shadow-[0_30px_80px_-30px_rgb(20_33_61/0.6)]',
            variant === 'modal' ? 'rounded-3xl' : 'rounded-t-3xl md:h-full md:max-h-none md:rounded-none md:rounded-l-3xl',
            tone === 'danger' && 'ring-2 ring-[var(--color-danger)]',
            'animate-[rise-in_280ms_var(--ease-cinematic)]',
            className,
          )}
        >
          {variant === 'sheet' && <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--hairline-strong)] md:hidden" />}
          <header className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div className="grid gap-1">
              <h2 id={titleId} className="text-[1.25rem] font-semibold tracking-[-0.02em]">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="tap-target -mr-2 inline-flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--tone-neutral-bg)] hover:text-[var(--text)]"
              >
                <CloseIcon size={20} />
              </button>
            )}
          </header>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div>}
          {footer && (
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--hairline)] px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
