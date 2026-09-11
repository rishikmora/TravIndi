"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { CrowdHeatmapPoint } from "@/lib/api";
import { riskColor } from "@/lib/crowd-risk-color";

function HeatLayer({ points }: { points: CrowdHeatmapPoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayer | null>(null);
  const [pluginReady, setPluginReady] = useState(false);

  useEffect(() => {
    import("leaflet.heat").then(() => setPluginReady(true));
  }, []);

  useEffect(() => {
    if (!pluginReady) return;
    const latlngs: L.HeatLatLngTuple[] = points
      .filter((p) => p.location)
      .map((p) => [p.location!.lat, p.location!.lon, Math.max(0.15, p.density ?? 0.3)]);

    if (!layerRef.current) {
      layerRef.current = L.heatLayer(latlngs, {
        radius: 45,
        blur: 35,
        maxZoom: 8,
        max: 1.0,
        gradient: { 0.2: "#3f7e56", 0.5: "#d9b56d", 0.8: "#b76a32", 1.0: "#d94e4e" },
      }).addTo(map);
    } else {
      layerRef.current.setLatLngs(latlngs);
    }
  }, [points, map, pluginReady]);

  useEffect(
    () => () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    },
    [map]
  );

  return null;
}

export function CrowdHeatmapMap({ points }: { points: CrowdHeatmapPoint[] }) {
  const mappable = points.filter((p) => p.location);

  return (
    <MapContainer
      center={[22.5, 79]}
      zoom={5}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
      className="rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <HeatLayer points={points} />
      {mappable.map((p) => (
        <CircleMarker
          key={p.h3_cell}
          center={[p.location!.lat, p.location!.lon]}
          radius={8 + (p.density ?? 0) * 10}
          pathOptions={{
            color: riskColor(p.risk_score),
            fillColor: riskColor(p.risk_score),
            fillOpacity: 0.75,
            weight: 2,
          }}
        >
          <Popup>
            <div className="min-w-[180px] text-sm">
              <div className="font-semibold">{p.destination_name ?? "Unnamed cell"}</div>
              <div className="mt-1 text-foreground/70">
                Live density: <span className="font-medium">{p.density != null ? `${Math.round(p.density * 100)}%` : "—"}</span>
              </div>
              <div className="text-foreground/70">
                Live risk: <span className="font-medium">{p.risk_score != null ? `${Math.round(p.risk_score * 100)}%` : "—"}</span>
              </div>
              <div className="mt-1 text-xs text-foreground/50">
                Baseline recorded {new Date(p.recorded_at).toLocaleString()}
              </div>
              {p.destination_id && (
                <Link href={`/destinations/${p.destination_id}`} className="mt-2 inline-block text-xs font-medium text-primary">
                  View destination →
                </Link>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
