"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { GeoPoint } from "@/lib/api";

/**
 * Single-marker live-location map — structured exactly like
 * CrowdHeatmapMap.tsx (its own file, dynamically imported with
 * `{ ssr: false }` by callers) so leaflet's module graph never leaks into
 * an SSR'd sibling. Deliberately minimal: one pin, no heat layer, no
 * clustering — this is "where is this one person right now," not a
 * density visualization.
 */
export function LocationShareMap({
  location,
  isLive,
  label,
}: {
  location: GeoPoint;
  isLive: boolean;
  label: string;
}) {
  return (
    <MapContainer
      center={[location.lat, location.lon]}
      zoom={13}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
      className="rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[location.lat, location.lon]}
        radius={12}
        pathOptions={{
          color: isLive ? "#3f7e56" : "#b76a32",
          fillColor: isLive ? "#3f7e56" : "#b76a32",
          fillOpacity: 0.75,
          weight: 2,
        }}
      >
        <Popup>
          <div className="text-sm">
            <div className="font-semibold">{label}</div>
            <div className="mt-0.5 text-foreground/70">{isLive ? "Live" : "Last known position"}</div>
          </div>
        </Popup>
      </CircleMarker>
    </MapContainer>
  );
}
