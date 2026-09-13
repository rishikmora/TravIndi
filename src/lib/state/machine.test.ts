import { describe, expect, it } from 'vitest';
import { adaptationMachine, bookingMachine, locationSharingMachine, sosMachine, syncMachine } from './machine';

describe('sosMachine', () => {
  it('requires confirmation before sending', () => {
    expect(sosMachine.next('ready', 'CONFIRM')).toBe('ready');
    expect(sosMachine.next('ready', 'PRESS')).toBe('confirming');
    expect(sosMachine.next('confirming', 'CONFIRM')).toBe('sending');
  });

  it('keeps an offline alert saved until the connection returns', () => {
    expect(sosMachine.next('sending', 'WENT_OFFLINE')).toBe('queued_offline');
    expect(sosMachine.next('queued_offline', 'CONNECTION_RESTORED')).toBe('sending');
    expect(sosMachine.next('sending', 'SERVER_RECEIVED')).toBe('received');
  });

  it('never skips straight to acknowledged while still sending', () => {
    expect(sosMachine.next('sending', 'ACKNOWLEDGED')).toBe('sending');
    expect(sosMachine.can('received', 'ACKNOWLEDGED')).toBe(true);
  });
});

describe('bookingMachine', () => {
  it('follows select → review → confirm → result', () => {
    let state = bookingMachine.initial;
    state = bookingMachine.next(state, 'REQUEST_QUOTE');
    state = bookingMachine.next(state, 'QUOTE_READY');
    expect(state).toBe('reviewing');
    state = bookingMachine.next(state, 'CONFIRM');
    expect(state).toBe('submitting');
    expect(bookingMachine.next(state, 'ACCEPTED_PROCESSING')).toBe('processing');
  });

  it('allows a safe retry after an unknown outcome', () => {
    expect(bookingMachine.next('submitting', 'SUBMIT_ERROR')).toBe('error');
    expect(bookingMachine.next('error', 'RETRY')).toBe('submitting');
  });

  it('treats confirmed as final', () => {
    expect(bookingMachine.next('confirmed', 'FAILED')).toBe('confirmed');
  });
});

describe('adaptationMachine', () => {
  it('distinguishes conflicts, expiry and failure', () => {
    expect(adaptationMachine.next('applying', 'VERSION_CONFLICT')).toBe('conflict');
    expect(adaptationMachine.next('applying', 'EXPIRED')).toBe('expired');
    expect(adaptationMachine.next('applying', 'APPLY_FAILED')).toBe('failed');
  });

  it('ignores success events outside an apply', () => {
    expect(adaptationMachine.next('idle', 'APPLY_SUCCEEDED')).toBe('idle');
  });
});

describe('locationSharingMachine', () => {
  it('goes live only after permission and a created share', () => {
    expect(locationSharingMachine.next('off', 'PERMISSION_GRANTED')).toBe('off');
    expect(locationSharingMachine.next('requesting_permission', 'PERMISSION_DENIED')).toBe('permission_denied');
    expect(locationSharingMachine.next('starting', 'SHARE_CREATED')).toBe('live');
  });
});

describe('syncMachine', () => {
  it('reconnects before syncing', () => {
    expect(syncMachine.next('offline', 'CAME_ONLINE')).toBe('reconnecting');
    expect(syncMachine.next('reconnecting', 'SYNC_STARTED')).toBe('syncing');
    expect(syncMachine.next('syncing', 'SYNC_FAILED')).toBe('sync_error');
  });
});
