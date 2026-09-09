import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/businesses/")({
  head: () => ({
    meta: [
      { title: "Verified businesses — TravIndi" },
      { name: "description", content: "Stays, transport, food and experiences that cleared a real KYC workflow." },
      { property: "og:title", content: "Verified businesses — TravIndi" },
      { property: "og:description", content: "Stays, transport, food and experiences that cleared a real KYC workflow." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Verified local" title="Verified businesses" description="Stays, transport, food and experiences that cleared a real KYC workflow.">
      <ComingInNextPhase note="Business directory, filters and verification badges arrive next." />
    </PageShell>
  );
}
