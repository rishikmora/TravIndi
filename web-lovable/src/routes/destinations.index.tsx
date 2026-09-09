import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/destinations/")({
  head: () => ({
    meta: [
      { title: "Destinations across India — TravIndi" },
      { name: "description", content: "Search 5,000+ attractions with safety scores, crowd timing and accessibility data." },
      { property: "og:title", content: "Destinations across India — TravIndi" },
      { property: "og:description", content: "Search 5,000+ attractions with safety scores, crowd timing and accessibility data." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Discover" title="Destinations across India" description="Search 5,000+ attractions with safety scores, crowd timing and accessibility data.">
      <ComingInNextPhase note="Destination discovery, filters and map view arrive in the next phase." />
    </PageShell>
  );
}
