import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/trips/")({
  head: () => ({
    meta: [
      { title: "My trips — TravIndi" },
      { name: "description", content: "Every itinerary you've generated or saved, with live safety context." },
      { property: "og:title", content: "My trips — TravIndi" },
      { property: "og:description", content: "Every itinerary you've generated or saved, with live safety context." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Your travel" title="My trips" description="Every itinerary you've generated or saved, with live safety context.">
      <ComingInNextPhase note="Trip list and trip creation come next, backed by the real trips endpoints." />
    </PageShell>
  );
}
