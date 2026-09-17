'use client';

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, GlobeIcon } from '@/components/ui/icons';
import { LOCALE_INFO, LOCALES, type Locale } from '@/i18n/config';
import { useTranslation } from '@/i18n/react';
import { getTranslator } from '@/i18n/runtime';
import { announce, toast } from '@/lib/ui/toast';
import { cn } from '@/utils/cn';

interface LanguageSelectorProps {
  /** Classes for the trigger, so it matches the toolbar it sits in. */
  className?: string;
}

/**
 * The language switcher in the navigation bar: a button showing the current
 * language and a listbox of every language, each named in its own script.
 * Switching applies immediately, keeps everything on screen as it was, and is
 * remembered on this device.
 */
export function LanguageSelector({ className }: LanguageSelectorProps) {
  const { t, locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Locale>(locale);
  const [switching, setSwitching] = useState<Locale | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<Locale, HTMLLIElement>());
  const listId = useId();
  const current = LOCALE_INFO[locale];

  // Move focus to the highlighted option whenever it changes while open.
  useEffect(() => {
    if (open) optionRefs.current.get(active)?.focus();
  }, [open, active]);

  // Close on outside press.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const openList = (highlight: Locale) => {
    setActive(highlight);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const choose = async (next: Locale) => {
    close(true);
    if (next === locale) return;
    setSwitching(next);
    const applied = await setLocale(next);
    setSwitching(null);
    const nextT = getTranslator(applied ? next : locale);
    if (applied) {
      announce(nextT('language.changed', { language: LOCALE_INFO[next].nativeName }));
    } else {
      toast.warning(nextT('language.offlineTitle'), nextT('language.offlineDetail'));
    }
  };

  const move = (offset: number) => {
    const index = LOCALES.indexOf(active);
    setActive(LOCALES[(index + offset + LOCALES.length) % LOCALES.length]!);
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openList(event.key === 'ArrowDown' ? locale : LOCALES[LOCALES.length - 1]!);
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActive(LOCALES[0]);
        break;
      case 'End':
        event.preventDefault();
        setActive(LOCALES[LOCALES.length - 1]!);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        void choose(active);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default: {
        // Type-ahead on the English name, so any keyboard can reach every language.
        if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
        const letter = event.key.toLowerCase();
        const start = LOCALES.indexOf(active) + 1;
        const ordered = [...LOCALES.slice(start), ...LOCALES.slice(0, start)];
        const match = ordered.find((code) => LOCALE_INFO[code].englishName.toLowerCase().startsWith(letter));
        if (match) setActive(match);
      }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t('language.button', { language: `${current.nativeName} (${current.englishName})` })}
        aria-busy={switching ? true : undefined}
        onClick={() => (open ? close(false) : openList(locale))}
        onKeyDown={onButtonKeyDown}
        className={cn(className, 'gap-1.5 px-2.5')}
      >
        <GlobeIcon size={18} className={cn('shrink-0', switching && 'animate-spin')} />
        <span lang={current.htmlLang} className="text-[0.8125rem] font-medium sm:hidden">
          {current.short}
        </span>
        <span lang={current.htmlLang} className="hidden text-[0.8125rem] font-medium sm:inline">
          {current.nativeName}
        </span>
        <ChevronDownIcon size={14} className={cn('hidden shrink-0 opacity-60 transition-transform duration-200 sm:block', open && 'rotate-180')} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('language.listLabel')}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          data-lenis-prevent
          className="theme-app absolute right-0 top-[calc(100%+0.5rem)] z-[60] max-h-[min(70dvh,26rem)] w-[min(16rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-[var(--surface-raised)] p-1.5 text-[var(--text)] shadow-[0_24px_60px_-24px_rgb(20_33_61/0.55)] ring-1 ring-[var(--hairline)] animate-[rise-in_200ms_var(--ease-cinematic)]"
        >
          {LOCALES.map((code) => {
            const info = LOCALE_INFO[code];
            const selected = code === locale;
            return (
              <li
                key={code}
                ref={(node) => {
                  if (node) optionRefs.current.set(code, node);
                  else optionRefs.current.delete(code);
                }}
                role="option"
                aria-selected={selected}
                aria-label={code === 'en' ? info.nativeName : `${info.nativeName} (${info.englishName})`}
                tabIndex={code === active ? 0 : -1}
                onClick={() => void choose(code)}
                onMouseMove={() => {
                  if (active !== code) setActive(code);
                }}
                className={cn(
                  'tap-target flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 outline-none',
                  code === active && 'bg-[var(--tone-neutral-bg)]',
                  'focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
                )}
              >
                <span className="grid min-w-0">
                  <span lang={info.htmlLang} className="truncate text-[0.9375rem] font-medium">
                    {info.nativeName}
                  </span>
                  {code !== 'en' && (
                    <span lang="en" className="truncate text-[0.75rem] text-[var(--text-muted)]">
                      {info.englishName}
                    </span>
                  )}
                </span>
                {selected && <CheckIcon size={18} className="shrink-0 text-[var(--color-teal)]" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
