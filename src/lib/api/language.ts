import { acceptLanguage, LOCALE_INFO } from '@/i18n/config';
import { getRequestLocale } from '@/i18n/runtime';
import type { LanguageCode } from '@/types/api';

/*
 * The traveller's language, as the API layer sends it. Every request carries
 * `Accept-Language`; AI requests also carry an explicit journey context so the
 * backend writes explanations and recommendations in that language even when a
 * proxy strips headers. Nothing here translates data: names, IDs and codes are
 * returned by the backend exactly as they are.
 */

export const requestLanguage = (): LanguageCode => getRequestLocale();

export const acceptLanguageHeader = (): string => acceptLanguage(getRequestLocale());

/** Fields merged into AI request bodies (domain casing; the repository client converts them). */
export function journeyContext() {
  const language = requestLanguage();
  return { journeyContext: { language } };
}

/** BCP 47 tag for requests that take a `locale` (e.g. "te-IN"). */
export const requestLocaleTag = (): string => LOCALE_INFO[getRequestLocale()].htmlLang;
