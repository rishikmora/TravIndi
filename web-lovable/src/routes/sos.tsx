import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/sos")({
  head: () => ({
    meta: [
      { title: "Emergency SOS & safety tools — TravIndi" },
      { name: "description", content: "One-tap SOS, trusted contacts, live location sharing and safe-route scoring." },
      { property: "og:title", content: "Emergency SOS & safety tools — TravIndi" },
      { property: "og:description", content: "One-tap SOS, trusted contacts, live location sharing and safe-route scoring." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Safety" title="Emergency SOS & safety tools" description="One-tap SOS, trusted contacts, live location sharing and safe-route scoring.">
      <ComingInNextPhase note="The SOS trigger, trusted contacts and live tracking are built in the safety phase. In a real emergency, call 112." />
    </PageShell>
  );
}
