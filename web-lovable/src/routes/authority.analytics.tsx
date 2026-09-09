import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/authority/analytics")({
  head: () => ({
    meta: [
      { title: "Tourism analytics — TravIndi" },
      { name: "description", content: "Footfall, incident trends and destination pressure across regions." },
      { property: "og:title", content: "Tourism analytics — TravIndi" },
      { property: "og:description", content: "Footfall, incident trends and destination pressure across regions." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Authority" title="Tourism analytics" description="Footfall, incident trends and destination pressure across regions.">
      <ComingInNextPhase note="Charts and regional analytics arrive in the authority phase." />
    </PageShell>
  );
}
