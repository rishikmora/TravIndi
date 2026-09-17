/**
 * Languages TravIndi is available in. English is the source language and the
 * fallback for anything a dictionary does not (yet) contain.
 */

export const LOCALES = ['en', 'hi', 'te', 'ta', 'kn', 'ml', 'bn', 'mr'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export type Script = 'Latn' | 'Deva' | 'Telu' | 'Taml' | 'Knda' | 'Mlym' | 'Beng';

export interface LocaleInfo {
  code: Locale;
  /** Name in English, e.g. "Telugu". */
  englishName: string;
  /** Name in the language itself, e.g. "తెలుగు". Always shown in that script. */
  nativeName: string;
  /** Compact label for narrow toolbars. */
  short: string;
  /** Value for the document `lang` attribute. */
  htmlLang: string;
  /**
   * Locale passed to `Intl`. Western digits are used everywhere: phone numbers,
   * ticket references, prices and times must read identically in every language.
   */
  intl: string;
  script: Script;
}

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  en: { code: 'en', englishName: 'English', nativeName: 'English', short: 'EN', htmlLang: 'en-IN', intl: 'en-IN', script: 'Latn' },
  hi: { code: 'hi', englishName: 'Hindi', nativeName: 'हिंदी', short: 'हिं', htmlLang: 'hi-IN', intl: 'hi-IN-u-nu-latn', script: 'Deva' },
  te: { code: 'te', englishName: 'Telugu', nativeName: 'తెలుగు', short: 'తె', htmlLang: 'te-IN', intl: 'te-IN-u-nu-latn', script: 'Telu' },
  ta: { code: 'ta', englishName: 'Tamil', nativeName: 'தமிழ்', short: 'த', htmlLang: 'ta-IN', intl: 'ta-IN-u-nu-latn', script: 'Taml' },
  kn: { code: 'kn', englishName: 'Kannada', nativeName: 'ಕನ್ನಡ', short: 'ಕ', htmlLang: 'kn-IN', intl: 'kn-IN-u-nu-latn', script: 'Knda' },
  ml: { code: 'ml', englishName: 'Malayalam', nativeName: 'മലയാളം', short: 'മ', htmlLang: 'ml-IN', intl: 'ml-IN-u-nu-latn', script: 'Mlym' },
  bn: { code: 'bn', englishName: 'Bengali', nativeName: 'বাংলা', short: 'বা', htmlLang: 'bn-IN', intl: 'bn-IN-u-nu-latn', script: 'Beng' },
  mr: { code: 'mr', englishName: 'Marathi', nativeName: 'मराठी', short: 'म', htmlLang: 'mr-IN', intl: 'mr-IN-u-nu-latn', script: 'Deva' },
};

/** Where the traveller's choice is kept on this device. */
export const LOCALE_STORAGE_KEY = 'travindi:locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** `Accept-Language` value for API requests: the chosen language, then English. */
export function acceptLanguage(locale: Locale): string {
  if (locale === 'en') return 'en-IN, en;q=0.9';
  return `${LOCALE_INFO[locale].htmlLang}, ${locale};q=0.9, en-IN;q=0.6, en;q=0.5`;
}
