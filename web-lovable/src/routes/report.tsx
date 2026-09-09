import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report an incident — TravIndi" },
      { name: "description", content: "Report harassment, scams, unsafe areas or accidents to the right authority." },
      { property: "og:title", content: "Report an incident — TravIndi" },
      { property: "og:description", content: "Report harassment, scams, unsafe areas or accidents to the right authority." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Safety" title="Report an incident" description="Report harassment, scams, unsafe areas or accidents to the right authority.">
      <ComingInNextPhase note="The incident report form and status tracking come in the safety phase." />
    </PageShell>
  );
}
