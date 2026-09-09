import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/authority/verifications")({
  head: () => ({
    meta: [
      { title: "Verification queue — TravIndi" },
      { name: "description", content: "Review and decide KYC submissions from guides and businesses." },
      { property: "og:title", content: "Verification queue — TravIndi" },
      { property: "og:description", content: "Review and decide KYC submissions from guides and businesses." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Authority" title="Verification queue" description="Review and decide KYC submissions from guides and businesses.">
      <ComingInNextPhase note="The verification queue is built in the authority phase." />
    </PageShell>
  );
}
