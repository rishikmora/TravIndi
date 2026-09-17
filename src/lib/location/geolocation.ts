import { translate } from '@/i18n/runtime';

export type GeolocationFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

/** What to tell the traveller about a failed location lookup, in their language. */
export function geolocationMessage(error: unknown): string {
  const reason: GeolocationFailure = error instanceof GeolocationError ? error.reason : 'unavailable';
  return translate(`safety.location.${reason}`);
}

export class GeolocationError extends Error {
  constructor(readonly reason: GeolocationFailure) {
    super(
      reason === 'denied'
        ? 'Location permission is turned off for this site.'
        : reason === 'unsupported'
          ? 'This browser can’t share location.'
          : reason === 'timeout'
            ? 'Finding your location took too long.'
            : 'Your location isn’t available right now.',
    );
  }
}

export interface Position {
  lat: number;
  lng: number;
  /** Metres. */
  accuracy: number | null;
  recordedAt: string;
}

const toPosition = (p: GeolocationPosition): Position => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
  recordedAt: new Date(p.timestamp).toISOString(),
});

const toError = (error: GeolocationPositionError) =>
  new GeolocationError(error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable');

/** One-off position. Asked for only in response to a user action. */
export function getCurrentPosition(options: { highAccuracy?: boolean; timeoutMs?: number } = {}): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationError('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition((p) => resolve(toPosition(p)), (e) => reject(toError(e)), {
      enableHighAccuracy: options.highAccuracy ?? false,
      timeout: options.timeoutMs ?? 10_000,
      maximumAge: 30_000,
    });
  });
}

/** Continuous watch; returns a function that stops watching. */
export function watchPosition(onPosition: (position: Position) => void, onError: (error: GeolocationError) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError(new GeolocationError('unsupported'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition((p) => onPosition(toPosition(p)), (e) => onError(toError(e)), {
    enableHighAccuracy: true,
    maximumAge: 15_000,
    timeout: 30_000,
  });
  return () => navigator.geolocation.clearWatch(id);
}

export async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}
