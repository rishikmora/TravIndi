// Deliberately its own file with zero leaflet/react-leaflet imports: the
// crowd page needs this color mapping statically (for the legend, list
// rows, etc.), and if it lived in CrowdHeatmapMap.tsx instead, that static
// import would drag leaflet's module graph into the page's server-render
// pass — leaflet touches `window` at module-evaluation time, which throws
// "window is not defined" under SSR even though the map component itself
// is loaded via next/dynamic(..., { ssr: false }).
export function riskColor(risk: number | null): string {
  if (risk == null) return "#6d7e8c";
  if (risk >= 0.7) return "#d94e4e";
  if (risk >= 0.4) return "#b76a32";
  return "#3f7e56";
}
