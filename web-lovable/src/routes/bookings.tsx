import { createFileRoute } from "@tanstack/react-router";
import { ComingInNextPhase, PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "My bookings — TravIndi" },
      { name: "description", content: "QR tickets, confirmations and refunds — all real, none simulated." },
      { property: "og:title", content: "My bookings — TravIndi" },
      { property: "og:description", content: "QR tickets, confirmations and refunds — all real, none simulated." },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell eyebrow="Tickets" title="My bookings" description="QR tickets, confirmations and refunds — all real, none simulated.">
      <ComingInNextPhase note="Booking list and QR tickets come with the bookings phase." />
    </PageShell>
  );
}
