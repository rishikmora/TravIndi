"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { GeoPoint } from "@/lib/api";

export interface ItineraryMapStop {
  id: string;
  location: GeoPoint;
  sequence: number;
  name: string;
  timeLabel: string | null;
  completed: boolean;
}

/**
 * Real stops only — an item with no matched `attraction_id`/location is
 * simply left off the map rather than guessed at. Structured like
 * LocationShareMap.tsx/CrowdHeatmapMap.tsx (dynamically imported with
 * `{ ssr: false }` by the caller) so leaflet never enters the SSR module
 * graph. Numbered markers in itinerary order — this is "the shape of my
 * day," not a density/heat visualization, so no clustering.
 */
export function ItineraryMap({ stops }: { stops: ItineraryMapStop[] }) {
  if (stops.length === 0) return null;
  const center = stops[Math.floor(stops.length / 2)]!.location;

  return (
    <MapContainer center={[center.lat, center.lon]} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stops.map((stop) => (
        <CircleMarker
          key={stop.id}
          center={[stop.location.lat, stop.location.lon]}
          radius={14}
          pathOptions={{
            color: stop.completed ? "#3f7e56" : "#b76a32",
            fillColor: stop.completed ? "#3f7e56" : "#b76a32",
            fillOpacity: 0.85,
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">
                {stop.sequence}. {stop.name}
              </div>
              {stop.timeLabel && <div className="mt-0.5 text-foreground/70">{stop.timeLabel}</div>}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
