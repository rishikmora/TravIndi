import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/guides")({
  head: () => ({
    meta: [
      { title: "Licensed guides — TravIndi" },
      { name: "description", content: "Government-licensed, background-checked guides across every state." },
      { property: "og:title", content: "Licensed guides — TravIndi" },
      { property: "og:description", content: "Government-licensed, background-checked guides across every state." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="People" title="Licensed guides" description="Government-licensed, background-checked guides across every state.">
      <ComingInNextPhase note="Guide profiles, languages and availability land in the next phase." />
    </PageShell>
  );
}
