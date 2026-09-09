import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/trips/$id")({
  head: () => ({
    meta: [
      { title: "Trip detail — TravIndi" },
      { name: "description", content: "Day-by-day plan, bookings, and safe routes for this journey." },
      { property: "og:title", content: "Trip detail — TravIndi" },
      { property: "og:description", content: "Day-by-day plan, bookings, and safe routes for this journey." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Itinerary" title="Trip detail" description="Day-by-day plan, bookings, and safe routes for this journey.">
      <ComingInNextPhase note="The day-by-day itinerary view is built in the trips phase." />
    </PageShell>
  );
}
