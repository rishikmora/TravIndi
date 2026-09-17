import { DEFAULT_LOCALE, isLocale, LOCALE_INFO, LOCALE_STORAGE_KEY, LOCALES, type Locale } from './config';
import en from './locales/en';
import { createTranslator, type MessageTree, type TranslateOptions, type Translator, type TranslationValues } from './translate';
import type { TranslationKey } from './types';

/*
 * The active language, shared by components, formatters and the API layer.
 *
 * It lives outside React so non-component code (API headers, date formatting,
 * the development backend) reads the same value, and so only components that
 * display text re-render when it changes. The server always renders English;
 * a saved choice is applied after hydration, so server and client markup match.
 */

type Loader = () => Promise<{ default: MessageTree }>;

/** Each language is its own chunk, fetched only when chosen (or pre-cached for offline use). */
const loaders: Record<Exclude<Locale, 'en'>, Loader> = {
  hi: () => import('./locales/hi'),
  te: () => import('./locales/te'),
  ta: () => import('./locales/ta'),
  kn: () => import('./locales/kn'),
  ml: () => import('./locales/ml'),
  bn: () => import('./locales/bn'),
  mr: () => import('./locales/mr'),
};

const english = en as unknown as MessageTree;
const dictionaries = new Map<Locale, MessageTree>([[DEFAULT_LOCALE, english]]);
const inflight = new Map<Locale, Promise<MessageTree>>();
const translators = new Map<Locale, Translator>();
const listeners = new Set<() => void>();

let active: Locale = DEFAULT_LOCALE;
let latestRequest = 0;
/** A language being switched to while its dictionary loads. */
let requested: Locale | null = null;

export const getLocale = (): Locale => active;

/**
 * The language API requests should ask for. A switch in progress (or a saved
 * choice not yet applied after page load) wins over the language on screen, so
 * the first requests already come back in the traveller's language.
 */
export const getRequestLocale = (): Locale => requested ?? active;

export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const isDictionaryLoaded = (locale: Locale) => dictionaries.has(locale);

export function loadDictionary(locale: Locale): Promise<MessageTree> {
  const ready = dictionaries.get(locale);
  if (ready) return Promise.resolve(ready);
  let pending = inflight.get(locale);
  if (!pending) {
    pending = loaders[locale as Exclude<Locale, 'en'>]()
      .then((module) => {
        dictionaries.set(locale, module.default);
        translators.delete(locale);
        return module.default;
      })
      .finally(() => inflight.delete(locale));
    inflight.set(locale, pending);
  }
  return pending;
}

export function getTranslator(locale: Locale = active): Translator {
  const cached = translators.get(locale);
  if (cached) return cached;
  const translator = createTranslator(locale, dictionaries.get(locale), english);
  // A language still loading renders English for now; cache only complete translators.
  if (dictionaries.has(locale)) translators.set(locale, translator);
  return translator;
}

/** Translate outside React (formatters, toasts raised from callbacks, the development backend). */
export function translate(key: TranslationKey, values?: TranslationValues, options?: TranslateOptions): string {
  return getTranslator()(key, values, options);
}

export function readStoredLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function storeLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage blocked (private mode): the choice lasts for this visit only.
  }
}

export function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = LOCALE_INFO[locale].htmlLang;
  root.dataset.locale = locale;
  root.dataset.script = LOCALE_INFO[locale].script;
}

/**
 * Switches the interface language without reloading, so nothing on screen
 * loses its state. Resolves `false` and changes nothing when the dictionary
 * cannot be loaded (for example offline, before it was cached).
 */
export async function setLocale(locale: Locale, options: { persist?: boolean } = {}): Promise<boolean> {
  const request = ++latestRequest;
  requested = locale;
  try {
    await loadDictionary(locale);
  } catch {
    if (request === latestRequest) requested = null;
    return false;
  }
  // A newer choice made while this one was loading wins.
  if (request !== latestRequest) return false;
  requested = null;
  if (options.persist !== false) storeLocale(locale);
  applyDocumentLocale(locale);
  if (locale !== active) {
    active = locale;
    listeners.forEach((listener) => listener());
  }
  return true;
}

// Before hydration applies a saved language, requests should already use it.
if (typeof window !== 'undefined') {
  const saved = readStoredLocale();
  if (saved && saved !== DEFAULT_LOCALE) requested = saved;
}

/** Loads every dictionary so the service worker keeps a copy for offline language switching. */
export async function precacheDictionaries() {
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    try {
      await loadDictionary(locale);
    } catch {
      return;
    }
  }
}
