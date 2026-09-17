'use client';

import { Fragment, type ReactNode, useEffect, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, type Locale } from './config';
import {
  applyDocumentLocale,
  getLocale,
  getTranslator,
  loadDictionary,
  precacheDictionaries,
  readStoredLocale,
  setLocale,
  subscribeLocale,
} from './runtime';
import type { TranslationValues, Translator } from './translate';
import type { TranslationKey } from './types';

const serverLocale = (): Locale => DEFAULT_LOCALE;

/** The active language. Components re-render only when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, serverLocale);
}

export type RichTags = Record<string, (chunks: string) => ReactNode>;

/**
 * Renders a translation containing simple tags, e.g.
 * `"Call <strong>112</strong> now"` with `{ strong: (text) => <strong>{text}</strong> }`,
 * so word order stays under each language's control.
 */
export function renderRich(text: string, tags: RichTags): ReactNode {
  const pattern = /<(\w+)>([\s\S]*?)<\/\1>/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const render = tags[match[1]!];
    nodes.push(<Fragment key={match.index}>{render ? render(match[2]!) : match[2]}</Fragment>);
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export interface TranslationApi {
  locale: Locale;
  t: Translator;
  rich: (key: TranslationKey, tags: RichTags, values?: TranslationValues) => ReactNode;
  setLocale: typeof setLocale;
}

/**
 * `const { t } = useTranslation(); t('safety.sos.send')`. The returned object is
 * stable until the language changes.
 */
export function useTranslation(): TranslationApi {
  const locale = useLocale();
  return useMemo(() => {
    const t = getTranslator(locale);
    return {
      locale,
      t,
      rich: (key, tags, values) => renderRich(t(key, values), tags),
      setLocale,
    };
  }, [locale]);
}

/** Inline translation for server components and static markup. */
export function T({ k, values }: { k: TranslationKey; values?: TranslationValues }) {
  const { t } = useTranslation();
  return <>{t(k, values)}</>;
}

// Start fetching a saved language as soon as this module runs — before React
// hydrates — so it is usually ready by the time it can be applied.
if (typeof window !== 'undefined') {
  const saved = readStoredLocale();
  if (saved && saved !== DEFAULT_LOCALE) void loadDictionary(saved).catch(() => undefined);
}

function whenIdle(callback: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 8000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 4000);
  return () => clearTimeout(id);
}

/**
 * Applies the saved language after hydration, keeps tabs in sync and, once the
 * app works offline, keeps every dictionary cached so switching language never
 * needs a connection.
 */
export function LocaleBoot() {
  useEffect(() => {
    const root = document.documentElement;
    const reveal = () => requestAnimationFrame(() => root.removeAttribute('data-locale-pending'));
    const saved = readStoredLocale();
    if (saved && saved !== getLocale()) {
      void setLocale(saved, { persist: false })
        .then((applied) => {
          if (!applied) applyDocumentLocale(getLocale());
        })
        .finally(reveal);
    } else {
      reveal();
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY && isLocale(event.newValue)) void setLocale(event.newValue, { persist: false });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return;
    if (!('serviceWorker' in navigator)) return;
    let cancel = () => {};
    void navigator.serviceWorker.ready.then(() => {
      cancel = whenIdle(() => void precacheDictionaries());
    });
    return () => cancel();
  }, []);

  return null;
}
