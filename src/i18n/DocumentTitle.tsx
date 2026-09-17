'use client';

import { useEffect } from 'react';
import en from './locales/en';
import { getLocale, getTranslator, subscribeLocale } from './runtime';

/*
 * Page titles are rendered on the server in English (Next.js metadata). This
 * swaps each known English title segment ("Safety centre · TravIndi") for its
 * translation, and re-applies it whenever Next.js sets a new title or the
 * language changes. Names in titles (a destination, the brand) stay as they are.
 */

const SEPARATOR = ' · ';

const SEGMENT_KEYS = new Map<string, string>([
  [en.common.meta.title, 'common.meta.title'],
  [en.destinations.list.metaTitle, 'destinations.list.metaTitle'],
  [en.destinations.detail.notFound, 'destinations.detail.notFound'],
  ...Object.entries(en.meta.titles).map(([id, text]) => [text, `meta.titles.${id}`] as [string, string]),
]);

function localizeTitle(title: string): string {
  const t = getTranslator();
  return title
    .split(SEPARATOR)
    .map((segment) => {
      const key = SEGMENT_KEYS.get(segment);
      return key ? t.dynamic(key, undefined, { fallback: segment }) : segment;
    })
    .join(SEPARATOR);
}

export function DocumentTitleSync() {
  useEffect(() => {
    // The latest title Next.js set (English), and the title this component last wrote.
    let source = document.title;
    let written: string | null = null;

    const sync = () => {
      if (document.title !== written) source = document.title;
      const next = getLocale() === 'en' ? source : localizeTitle(source);
      written = next;
      if (document.title !== next) document.title = next;
    };

    sync();
    const unsubscribe = subscribeLocale(sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, []);

  return null;
}
