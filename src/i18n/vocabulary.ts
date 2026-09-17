import { translate } from './runtime';
import type { TranslationKey } from './types';

/*
 * Helpers for status vocabularies ("Confirmed", "At risk", "Caution"). Each
 * label is looked up when it is read, so it always follows the active language
 * while the table keeps its tones and structure.
 */

/** `{ confirmed: "Confirmed", … }` with every value translated on read. */
export function translatedLabels<K extends string>(keys: readonly K[], keyFor: (key: K) => TranslationKey): Record<K, string> {
  const table = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(table, key, { enumerable: true, get: () => translate(keyFor(key)) });
  }
  return table;
}

/** Adds translated `label` (and optional `description`) to each entry of a table. */
export function withTranslations<K extends string, V extends object>(
  entries: Record<K, V>,
  keysFor: (key: K) => { label: TranslationKey; description?: TranslationKey },
): Record<K, V & { label: string; description: string }> {
  const table = {} as Record<K, V & { label: string; description: string }>;
  for (const key of Object.keys(entries) as K[]) {
    const keys = keysFor(key);
    const entry = { ...entries[key] } as V & { label: string; description: string };
    Object.defineProperty(entry, 'label', { enumerable: true, get: () => translate(keys.label) });
    Object.defineProperty(entry, 'description', {
      enumerable: true,
      get: () => (keys.description ? translate(keys.description) : ''),
    });
    table[key] = entry;
  }
  return table;
}
