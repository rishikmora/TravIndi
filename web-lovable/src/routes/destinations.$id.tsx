import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/destinations/$id")({
  head: () => ({
    meta: [
      { title: "Destination detail — TravIndi" },
      { name: "description", content: "Deep dive into an attraction: safety, timings, nearby verified services." },
      { property: "og:title", content: "Destination detail — TravIndi" },
      { property: "og:description", content: "Deep dive into an attraction: safety, timings, nearby verified services." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Destination" title="Destination detail" description="Deep dive into an attraction: safety, timings, nearby verified services.">
      <ComingInNextPhase note="The full destination profile is wired to /destinations/{id} in a later phase." />
    </PageShell>
  );
}
