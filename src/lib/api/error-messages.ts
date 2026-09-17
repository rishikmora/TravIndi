import type { Locale } from '@/i18n/config';
import { getLocale, getTranslator } from '@/i18n/runtime';
import { ApiError, type ApiErrorKind, isApiError, normalizeThrown } from './errors';

/**
 * Operation the user was attempting. Lets a 409 during an itinerary edit read
 * differently from a 409 during booking.
 */
export type ErrorContext =
  | 'generic'
  | 'auth.login'
  | 'auth.register'
  | 'trip.load'
  | 'trip.create'
  | 'trip.intent'
  | 'trip.generate'
  | 'itinerary.update'
  | 'adaptation.accept'
  | 'adaptation.reject'
  | 'replan'
  | 'map.routes'
  | 'safety.load'
  | 'sos.send'
  | 'incident.report'
  | 'location.share'
  | 'chat.send'
  | 'chat.load'
  | 'booking.quote'
  | 'booking.create'
  | 'search'
  | 'destination.load'
  | 'profile.save'
  | 'authority.action'
  | 'verification.lookup';

export type RecoveryAction = 'retry' | 'sign_in' | 'go_back' | 'review_changes' | 'keep_server' | 'reapply' | 'contact_support' | 'try_later';

export interface ErrorDescription {
  title: string;
  message: string;
  /** What still works, so the user is never at a dead end. */
  stillAvailable?: string;
  actions: RecoveryAction[];
}

const ACTIONS: Record<ApiErrorKind, RecoveryAction[]> = {
  bad_request: ['retry', 'go_back'],
  unauthorized: ['sign_in'],
  forbidden: ['go_back'],
  not_found: ['go_back'],
  conflict: ['review_changes', 'keep_server', 'reapply'],
  validation: ['retry'],
  rate_limited: ['try_later'],
  server: ['retry', 'try_later'],
  bad_gateway: ['retry'],
  unavailable: ['retry', 'try_later'],
  gateway_timeout: ['retry'],
  network: ['retry'],
  timeout: ['retry'],
  aborted: ['retry'],
  unknown: ['retry', 'go_back'],
};

/** Contexts with their own wording (in `errors.contexts`), and any recovery actions they change. */
const CONTEXT_ACTIONS: Partial<Record<ErrorContext, Partial<Record<ApiErrorKind, RecoveryAction[] | null>>>> = {
  'auth.login': { unauthorized: ['retry'] },
  'trip.generate': { validation: null, unavailable: null },
  'itinerary.update': { conflict: null, not_found: null },
  'adaptation.accept': { conflict: ['review_changes', 'go_back'], not_found: ['go_back'] },
  'sos.send': { network: ['retry'] },
  'chat.send': { network: null, forbidden: null },
  'booking.create': { conflict: ['go_back', 'retry'], validation: null },
  'location.share': { forbidden: null },
  search: { network: null },
};

export function describeError(error: unknown, context: ErrorContext = 'generic', locale: Locale = getLocale()): ErrorDescription {
  const t = getTranslator(locale);
  const apiError: ApiError = isApiError(error) ? error : normalizeThrown(error);
  const kind = apiError.kind;
  const base: ErrorDescription = {
    title: t(`errors.kinds.${kind}.title`),
    message: t(`errors.kinds.${kind}.message`),
    actions: ACTIONS[kind],
  };
  const contextActions = CONTEXT_ACTIONS[context];
  if (!contextActions || !(kind in contextActions)) return base;

  const prefix = `errors.contexts.${context.replace('.', '_')}.${kind}`;
  const stillAvailable = `${prefix}.stillAvailable`;
  return {
    title: t.dynamic(`${prefix}.title`, undefined, { fallback: base.title }),
    message: t.dynamic(`${prefix}.message`, undefined, { fallback: base.message }),
    ...(t.has(stillAvailable) ? { stillAvailable: t.dynamic(stillAvailable) } : {}),
    actions: contextActions[kind] ?? base.actions,
  };
}
