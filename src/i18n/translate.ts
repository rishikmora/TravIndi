import { DEFAULT_LOCALE, LOCALE_INFO, type Locale } from './config';
import type { TranslationKey } from './types';

/**
 * The translation engine. Framework-free so the same lookup, fallback and
 * interpolation rules apply in components, formatters and the development
 * backend.
 *
 * Keys are dot paths ("safety.sos.title"). Plural forms live beside the base
 * key with a CLDR category suffix ("trips.days_one", "trips.days_other") and
 * are selected with `Intl.PluralRules` from a numeric `count` value.
 *
 * Resolution order: selected language → English. A key missing from English
 * as well (only possible for a key built at runtime) renders a readable
 * fallback rather than the key, `undefined` or an empty control.
 */

export interface MessageTree {
  [key: string]: string | MessageTree;
}

export type TranslationValues = Record<string, string | number | null | undefined>;

export interface TranslateOptions {
  /** Shown when neither the selected language nor English has the key. */
  fallback?: string;
}

export interface Translator {
  (key: TranslationKey, values?: TranslationValues, options?: TranslateOptions): string;
  /** Untyped lookup for keys assembled at runtime from API values. */
  dynamic: (key: string, values?: TranslationValues, options?: TranslateOptions) => string;
  /** True when the selected language or English defines the key. */
  has: (key: string) => boolean;
  /** The template itself, uninterpolated — for rich text. */
  raw: (key: TranslationKey, values?: TranslationValues) => string;
  locale: Locale;
}

const flattened = new WeakMap<MessageTree, Map<string, string>>();

/** Nested dictionary → flat "a.b.c" map, computed once per dictionary. */
export function flatten(tree: MessageTree): Map<string, string> {
  const cached = flattened.get(tree);
  if (cached) return cached;
  const out = new Map<string, string>();
  const walk = (node: MessageTree, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') out.set(path, value);
      else if (value && typeof value === 'object') walk(value, path);
    }
  };
  walk(tree, '');
  flattened.set(tree, out);
  return out;
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_INFO[locale].intl);
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

/**
 * Numbers inside sentences. Digit grouping starts at five digits, so years and
 * four-digit figures ("2026", "1600 m") read as written.
 */
export function formatInteger(locale: Locale, value: number): string {
  const grouped = Math.abs(value) >= 10_000;
  const id = `${locale}:${grouped}`;
  let format = numberFormats.get(id);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE_INFO[locale].intl, { maximumFractionDigits: 2, useGrouping: grouped });
    numberFormats.set(id, format);
  }
  return format.format(value);
}

/** "payment_pending" → "Payment pending". Last resort only. */
function humanize(key: string): string {
  const last = key.split('.').pop() ?? key;
  const words = last
    .replace(/_(zero|one|two|few|many|other)$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : '';
}

function find(messages: Map<string, string>, locale: Locale, key: string, count: number | null): string | undefined {
  if (count !== null) {
    const exact = messages.get(`${key}_${pluralCategory(locale, count)}`);
    if (exact !== undefined) return exact;
    const other = messages.get(`${key}_other`);
    if (other !== undefined) return other;
  }
  return messages.get(key);
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(template: string, values: TranslationValues | undefined, locale: Locale): string {
  if (!values || !template.includes('{')) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name];
    if (value === null || value === undefined) return '';
    return typeof value === 'number' ? formatInteger(locale, value) : value;
  });
}

export function createTranslator(locale: Locale, dictionary: MessageTree | undefined, english: MessageTree): Translator {
  const primary = dictionary ? flatten(dictionary) : null;
  const fallback = flatten(english);

  const template = (key: string, values: TranslationValues | undefined): { text: string; locale: Locale } | null => {
    const count = typeof values?.count === 'number' ? values.count : null;
    if (primary && locale !== DEFAULT_LOCALE) {
      const text = find(primary, locale, key, count);
      if (text) return { text, locale };
    }
    const text = find(fallback, DEFAULT_LOCALE, key, count);
    return text === undefined ? null : { text, locale: DEFAULT_LOCALE };
  };

  const resolve = (key: string, values?: TranslationValues, options?: TranslateOptions) => {
    const found = template(key, values);
    if (found) return interpolate(found.text, values, locale);
    if (process.env.NODE_ENV !== 'production') console.warn(`[i18n] Missing translation key "${key}"`);
    return options?.fallback ?? humanize(key);
  };

  const translate = ((key: TranslationKey, values?: TranslationValues, options?: TranslateOptions) =>
    resolve(key, values, options)) as Translator;
  translate.dynamic = resolve;
  translate.has = (key) => template(key, undefined) !== null || fallback.has(`${key}_other`);
  translate.raw = (key, values) => template(key, values)?.text ?? humanize(key);
  translate.locale = locale;
  return translate;
}
