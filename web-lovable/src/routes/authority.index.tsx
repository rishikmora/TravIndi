import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/authority/")({
  head: () => ({
    meta: [
      { title: "Authority console — TravIndi" },
      { name: "description", content: "Live tourist-safety dashboard for police, responders and tourism departments." },
      { property: "og:title", content: "Authority console — TravIndi" },
      { property: "og:description", content: "Live tourist-safety dashboard for police, responders and tourism departments." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Authority" title="Authority console" description="Live tourist-safety dashboard for police, responders and tourism departments.">
      <ComingInNextPhase note="The safety dashboard, incident queue and heatmaps arrive in the authority phase." />
    </PageShell>
  );
}
