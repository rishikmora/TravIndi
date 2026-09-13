/**
 * Minimal finite-state machines. Critical flows declare every legal
 * transition up front; anything else is ignored rather than producing an
 * impossible UI state (e.g. "confirmed" before the server responded).
 */

export interface MachineDefinition<S extends string, E extends string> {
  initial: S;
  transitions: { [State in S]: Partial<Record<E, S>> };
}

export function defineMachine<S extends string, E extends string>(definition: MachineDefinition<S, E>) {
  return {
    ...definition,
    /** The next state, or the current one if the event is not allowed here. */
    next(state: S, event: E): S {
      return definition.transitions[state][event] ?? state;
    },
    can(state: S, event: E): boolean {
      return definition.transitions[state][event] !== undefined;
    },
  };
}

export type Machine<S extends string, E extends string> = ReturnType<typeof defineMachine<S, E>>;

// SOS ----------------------------------------------------------------------------

export type SosState =
  | 'ready'
  | 'confirming'
  | 'sending'
  | 'queued_offline'
  | 'send_failed'
  | 'received'
  | 'acknowledged'
  | 'responding'
  | 'resolved'
  | 'cancelled';

export type SosEvent =
  | 'PRESS'
  | 'CANCEL_CONFIRM'
  | 'CONFIRM'
  | 'WENT_OFFLINE'
  | 'CONNECTION_RESTORED'
  | 'SEND_FAILED'
  | 'RETRY'
  | 'SERVER_RECEIVED'
  | 'ACKNOWLEDGED'
  | 'RESPONDING'
  | 'RESOLVED'
  | 'CANCELLED'
  | 'RESET';

export const sosMachine = defineMachine<SosState, SosEvent>({
  initial: 'ready',
  transitions: {
    ready: { PRESS: 'confirming', SERVER_RECEIVED: 'received', ACKNOWLEDGED: 'acknowledged', RESPONDING: 'responding' },
    confirming: { CANCEL_CONFIRM: 'ready', CONFIRM: 'sending' },
    sending: { SERVER_RECEIVED: 'received', WENT_OFFLINE: 'queued_offline', SEND_FAILED: 'send_failed' },
    queued_offline: { CONNECTION_RESTORED: 'sending', SERVER_RECEIVED: 'received' },
    send_failed: { RETRY: 'sending', WENT_OFFLINE: 'queued_offline', SERVER_RECEIVED: 'received' },
    received: { ACKNOWLEDGED: 'acknowledged', RESPONDING: 'responding', RESOLVED: 'resolved', CANCELLED: 'cancelled' },
    acknowledged: { RESPONDING: 'responding', RESOLVED: 'resolved', CANCELLED: 'cancelled' },
    responding: { RESOLVED: 'resolved', CANCELLED: 'cancelled' },
    resolved: { RESET: 'ready' },
    cancelled: { RESET: 'ready' },
  },
});

export function sosStateFromServer(status: 'received' | 'acknowledged' | 'responding' | 'resolved' | 'cancelled'): SosState {
  return status;
}

// Booking ------------------------------------------------------------------------

export type BookingFlowState =
  | 'selecting'
  | 'quoting'
  | 'reviewing'
  | 'submitting'
  | 'processing'
  | 'confirmed'
  | 'payment_pending'
  | 'failed'
  | 'error';

export type BookingFlowEvent =
  | 'REQUEST_QUOTE'
  | 'QUOTE_READY'
  | 'QUOTE_FAILED'
  | 'EDIT'
  | 'CONFIRM'
  | 'ACCEPTED_PROCESSING'
  | 'CONFIRMED'
  | 'PAYMENT_PENDING'
  | 'FAILED'
  | 'SUBMIT_ERROR'
  | 'RETRY';

export const bookingMachine = defineMachine<BookingFlowState, BookingFlowEvent>({
  initial: 'selecting',
  transitions: {
    selecting: { REQUEST_QUOTE: 'quoting' },
    quoting: { QUOTE_READY: 'reviewing', QUOTE_FAILED: 'selecting' },
    reviewing: { EDIT: 'selecting', CONFIRM: 'submitting', REQUEST_QUOTE: 'quoting' },
    submitting: { ACCEPTED_PROCESSING: 'processing', CONFIRMED: 'confirmed', PAYMENT_PENDING: 'payment_pending', FAILED: 'failed', SUBMIT_ERROR: 'error' },
    processing: { CONFIRMED: 'confirmed', PAYMENT_PENDING: 'payment_pending', FAILED: 'failed' },
    confirmed: {},
    payment_pending: { CONFIRMED: 'confirmed', FAILED: 'failed' },
    failed: { EDIT: 'selecting' },
    // An unknown outcome (e.g. network error): retrying is safe because creation is idempotent.
    error: { RETRY: 'submitting', EDIT: 'selecting' },
  },
});

// Adaptation review ----------------------------------------------------------------

export type AdaptationUiState =
  | 'idle'
  | 'announced'
  | 'reviewing'
  | 'applying'
  | 'applied'
  | 'rejecting'
  | 'kept_current'
  | 'conflict'
  | 'expired'
  | 'failed';

export type AdaptationUiEvent =
  | 'PROPOSAL_RECEIVED'
  | 'OPEN_REVIEW'
  | 'CLOSE_REVIEW'
  | 'ACCEPT'
  | 'APPLY_SUCCEEDED'
  | 'APPLY_FAILED'
  | 'VERSION_CONFLICT'
  | 'KEEP_CURRENT'
  | 'REJECT_SUCCEEDED'
  | 'EXPIRED'
  | 'DISMISS';

export const adaptationMachine = defineMachine<AdaptationUiState, AdaptationUiEvent>({
  initial: 'idle',
  transitions: {
    idle: { PROPOSAL_RECEIVED: 'announced', OPEN_REVIEW: 'reviewing' },
    announced: { OPEN_REVIEW: 'reviewing', KEEP_CURRENT: 'rejecting', EXPIRED: 'expired', DISMISS: 'idle' },
    reviewing: { ACCEPT: 'applying', KEEP_CURRENT: 'rejecting', CLOSE_REVIEW: 'announced', EXPIRED: 'expired' },
    applying: { APPLY_SUCCEEDED: 'applied', APPLY_FAILED: 'failed', VERSION_CONFLICT: 'conflict', EXPIRED: 'expired' },
    applied: { DISMISS: 'idle', PROPOSAL_RECEIVED: 'announced' },
    rejecting: { REJECT_SUCCEEDED: 'kept_current', APPLY_FAILED: 'reviewing' },
    kept_current: { DISMISS: 'idle', PROPOSAL_RECEIVED: 'announced' },
    conflict: { DISMISS: 'idle', PROPOSAL_RECEIVED: 'announced' },
    expired: { DISMISS: 'idle', PROPOSAL_RECEIVED: 'announced' },
    failed: { DISMISS: 'idle', OPEN_REVIEW: 'reviewing' },
  },
});

// Location sharing ---------------------------------------------------------------

export type LocationSharingState =
  | 'off'
  | 'requesting_permission'
  | 'permission_denied'
  | 'unavailable'
  | 'starting'
  | 'live'
  | 'paused'
  | 'stopping'
  | 'ended'
  | 'error';

export type LocationSharingEvent =
  | 'START'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_DENIED'
  | 'GEOLOCATION_UNAVAILABLE'
  | 'SHARE_CREATED'
  | 'SHARE_FAILED'
  | 'PAUSE'
  | 'RESUME'
  | 'STOP'
  | 'STOPPED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'RESET';

export const locationSharingMachine = defineMachine<LocationSharingState, LocationSharingEvent>({
  initial: 'off',
  transitions: {
    off: { START: 'requesting_permission', SHARE_CREATED: 'live' },
    requesting_permission: { PERMISSION_GRANTED: 'starting', PERMISSION_DENIED: 'permission_denied', GEOLOCATION_UNAVAILABLE: 'unavailable' },
    permission_denied: { RESET: 'off', START: 'requesting_permission' },
    unavailable: { RESET: 'off' },
    starting: { SHARE_CREATED: 'live', SHARE_FAILED: 'error' },
    live: { PAUSE: 'paused', STOP: 'stopping', EXPIRED: 'ended', REVOKED: 'ended' },
    paused: { RESUME: 'live', STOP: 'stopping', EXPIRED: 'ended', REVOKED: 'ended' },
    stopping: { STOPPED: 'ended', SHARE_FAILED: 'error' },
    ended: { RESET: 'off', START: 'requesting_permission' },
    error: { RESET: 'off', START: 'requesting_permission' },
  },
});

// Connectivity & sync --------------------------------------------------------------

export type SyncState = 'online' | 'offline' | 'reconnecting' | 'syncing' | 'synced' | 'sync_error';
export type SyncEvent = 'WENT_OFFLINE' | 'CAME_ONLINE' | 'RECONNECTING' | 'SYNC_STARTED' | 'SYNC_SUCCEEDED' | 'SYNC_FAILED' | 'SETTLED';

export const syncMachine = defineMachine<SyncState, SyncEvent>({
  initial: 'online',
  transitions: {
    online: { WENT_OFFLINE: 'offline', SYNC_STARTED: 'syncing', RECONNECTING: 'reconnecting' },
    offline: { CAME_ONLINE: 'reconnecting' },
    reconnecting: { SYNC_STARTED: 'syncing', SETTLED: 'online', WENT_OFFLINE: 'offline' },
    syncing: { SYNC_SUCCEEDED: 'synced', SYNC_FAILED: 'sync_error', WENT_OFFLINE: 'offline' },
    synced: { SETTLED: 'online', WENT_OFFLINE: 'offline', SYNC_STARTED: 'syncing' },
    sync_error: { SYNC_STARTED: 'syncing', WENT_OFFLINE: 'offline', SETTLED: 'online' },
  },
});

// Trip generation ------------------------------------------------------------------

export type GenerationUiState = 'editing' | 'submitting' | 'generating' | 'ready' | 'failed';
export type GenerationUiEvent = 'SUBMIT' | 'JOB_STARTED' | 'SUBMIT_FAILED' | 'JOB_COMPLETED' | 'JOB_FAILED' | 'EDIT';

export const generationMachine = defineMachine<GenerationUiState, GenerationUiEvent>({
  initial: 'editing',
  transitions: {
    editing: { SUBMIT: 'submitting' },
    submitting: { JOB_STARTED: 'generating', SUBMIT_FAILED: 'editing' },
    generating: { JOB_COMPLETED: 'ready', JOB_FAILED: 'failed' },
    ready: { EDIT: 'editing' },
    failed: { SUBMIT: 'submitting', EDIT: 'editing' },
  },
});
