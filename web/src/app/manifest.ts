import type { MetadataRoute } from "next";

// Next's native manifest route convention — no new dependency, never
// enters the Turbopack bundle pipeline (unlike a PWA build plugin would).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TravIndi",
    short_name: "TravIndi",
    description: "AI-powered smart travel & tourism / tourist-safety platform",
    start_url: "/",
    display: "standalone",
    background_color: "#f5efe3",
    theme_color: "#b76a32",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
