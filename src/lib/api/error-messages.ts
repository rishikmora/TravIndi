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

const byKind: Record<ApiErrorKind, ErrorDescription> = {
  bad_request: {
    title: 'That didn’t go through',
    message: 'Some of the information could not be used. Please check it and try again.',
    actions: ['retry', 'go_back'],
  },
  unauthorized: {
    title: 'Please sign in again',
    message: 'Your session has ended. Sign in to continue where you left off.',
    actions: ['sign_in'],
  },
  forbidden: {
    title: 'You don’t have access to this',
    message: 'Ask the owner for access, or return to your trips.',
    actions: ['go_back'],
  },
  not_found: {
    title: 'We couldn’t find that',
    message: 'It may have been removed or the link may be out of date.',
    actions: ['go_back'],
  },
  conflict: {
    title: 'This changed in the meantime',
    message: 'Someone — or something — updated this after you opened it.',
    actions: ['review_changes', 'keep_server', 'reapply'],
  },
  validation: {
    title: 'A few details need attention',
    message: 'Please review the highlighted fields.',
    actions: ['retry'],
  },
  rate_limited: {
    title: 'Too many requests',
    message: 'Please wait a moment before trying again.',
    actions: ['try_later'],
  },
  server: {
    title: 'Something went wrong on our side',
    message: 'This is not your fault. Please try again shortly.',
    actions: ['retry', 'try_later'],
  },
  bad_gateway: {
    title: 'A service didn’t respond correctly',
    message: 'Please try again in a moment.',
    actions: ['retry'],
  },
  unavailable: {
    title: 'TravIndi is briefly unavailable',
    message: 'We are working on it. Your saved information is still here.',
    actions: ['retry', 'try_later'],
  },
  gateway_timeout: {
    title: 'That took too long',
    message: 'The service did not answer in time. Please try again.',
    actions: ['retry'],
  },
  network: {
    title: 'You seem to be offline',
    message: 'Check your connection. Anything saved on this device is still available.',
    actions: ['retry'],
  },
  timeout: {
    title: 'That took too long',
    message: 'Your connection may be slow. Please try again.',
    actions: ['retry'],
  },
  aborted: { title: 'Cancelled', message: 'The request was cancelled.', actions: ['retry'] },
  unknown: {
    title: 'Something unexpected happened',
    message: 'Please try again.',
    actions: ['retry', 'go_back'],
  },
};

type Overrides = Partial<Record<ApiErrorKind, Partial<ErrorDescription>>>;

const byContext: Partial<Record<ErrorContext, Overrides>> = {
  'auth.login': {
    unauthorized: { title: 'Email or password is incorrect', message: 'Check your details and try again.', actions: ['retry'] },
  },
  'trip.generate': {
    validation: {
      title: 'We couldn’t build this journey yet',
      message: 'A few trip details are missing or conflict with each other. Review them and try again.',
    },
    unavailable: {
      title: 'The journey planner is busy',
      message: 'Your trip details are saved. Try generating again in a moment.',
      stillAvailable: 'Your trip draft is saved.',
    },
  },
  'itinerary.update': {
    conflict: {
      title: 'Your itinerary changed while you were away',
      message: 'Review the latest version before applying your change.',
    },
    not_found: {
      title: 'This stop is no longer available',
      message: 'We couldn’t update your itinerary because this place is no longer available.',
    },
  },
  'adaptation.accept': {
    conflict: {
      title: 'This update is out of date',
      message: 'Your itinerary changed after this suggestion was made. Nothing was applied.',
      stillAvailable: 'Your current itinerary is unchanged.',
      actions: ['review_changes', 'go_back'],
    },
    not_found: {
      title: 'This suggestion has expired',
      message: 'Nothing was changed. Your current plan still stands.',
      actions: ['go_back'],
    },
  },
  'sos.send': {
    network: {
      title: 'Saved on this device',
      message: 'Your alert will be sent as soon as you reconnect. If you are in immediate danger, call 112.',
      actions: ['retry'],
    },
  },
  'chat.send': {
    network: { title: 'Not sent', message: 'You appear to be offline. Try sending again when connected.' },
    forbidden: { title: 'You can’t post here', message: 'You may no longer be a member of this conversation.' },
  },
  'booking.create': {
    conflict: {
      title: 'Availability changed',
      message: 'This option was taken while you were reviewing it. Nothing was charged.',
      actions: ['go_back', 'retry'],
    },
    validation: { title: 'Booking details need attention', message: 'Please review the highlighted fields.' },
  },
  'location.share': {
    forbidden: { title: 'Sharing isn’t allowed here', message: 'You can’t share location with this group.' },
  },
  search: {
    network: { title: 'Search needs a connection', message: 'Saved trips and places are still available offline.' },
  },
};

export function describeError(error: unknown, context: ErrorContext = 'generic'): ErrorDescription {
  const apiError: ApiError = isApiError(error) ? error : normalizeThrown(error);
  const base = byKind[apiError.kind];
  const override = byContext[context]?.[apiError.kind];
  return { ...base, ...override, actions: override?.actions ?? base.actions };
}
