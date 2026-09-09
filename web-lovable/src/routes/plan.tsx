import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Plan a trip with grounded AI — TravIndi" },
      { name: "description", content: "Claude-powered itineraries built on real attraction data, your pace and your budget." },
      { property: "og:title", content: "Plan a trip with grounded AI — TravIndi" },
      { property: "og:description", content: "Claude-powered itineraries built on real attraction data, your pace and your budget." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="AI planner" title="Plan a trip with grounded AI" description="Claude-powered itineraries built on real attraction data, your pace and your budget.">
      <ComingInNextPhase note="The planner conversation and itinerary builder land in the AI phase." />
    </PageShell>
  );
}
