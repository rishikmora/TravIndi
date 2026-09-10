export interface Coordinates {
  lon: number;
  lat: number;
}

// India Gate — used if geolocation is unavailable, denied, or times out, so
// every safety flow (SOS, incident report, safe routes) still works rather
// than dead-ending on a permissions prompt.
export const FALLBACK_LOCATION: Coordinates = { lon: 77.2295, lat: 28.6129 };

export function getCurrentPosition(): Promise<{ coords: Coordinates; isReal: boolean }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ coords: FALLBACK_LOCATION, isReal: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ coords: { lon: pos.coords.longitude, lat: pos.coords.latitude }, isReal: true }),
      () => resolve({ coords: FALLBACK_LOCATION, isReal: false }),
      { timeout: 6000, enableHighAccuracy: true }
    );
  });
}
