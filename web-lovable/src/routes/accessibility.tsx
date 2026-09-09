import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/accessibility")({
  head: () => ({
    meta: [
      { title: "Accessible travel — TravIndi" },
      { name: "description", content: "Wheelchair access, sensory-friendly timing and assistance across destinations." },
      { property: "og:title", content: "Accessible travel — TravIndi" },
      { property: "og:description", content: "Wheelchair access, sensory-friendly timing and assistance across destinations." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Inclusive travel" title="Accessible travel" description="Wheelchair access, sensory-friendly timing and assistance across destinations.">
      <ComingInNextPhase note="Accessibility filters and profiles come in a later phase." />
    </PageShell>
  );
}
