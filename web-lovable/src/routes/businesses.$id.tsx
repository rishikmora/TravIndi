import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/businesses/$id")({
  head: () => ({
    meta: [
      { title: "Business profile — TravIndi" },
      { name: "description", content: "Verification status, services, reviews with AI authenticity signals." },
      { property: "og:title", content: "Business profile — TravIndi" },
      { property: "og:description", content: "Verification status, services, reviews with AI authenticity signals." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Business" title="Business profile" description="Verification status, services, reviews with AI authenticity signals.">
      <ComingInNextPhase note="The business profile and booking flow come in the bookings phase." />
    </PageShell>
  );
}
