import { api } from "@/lib/api";
import { DestinationsGrid } from "./DestinationsGrid";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic"; // public data still changes at runtime; no need to cache across requests yet

// Lowercase — matches the real values app/db/seed.py actually wrote, not
// FacilityCreateIn's uppercase Literal (see backend/app/domains/travel/
// routing.py for the full explanation of this case mismatch).
const _ACCESSIBILITY_FACILITY_TYPES = new Set([
  "wheelchair_ramp",
  "wheelchair_rental",
  "accessible_toilet",
  "elevator",
  "accessible_parking",
]);

export default async function DestinationsPage() {
  const destinations = await api.listDestinations();
  // Bounded (one call per seeded destination, ~10 today) real facility
  // counts — lets every card show a genuine accessibility signal without
  // opening it, the same "the whole experience adapts" goal as the AI
  // planner and route scoring.
  const accessibleCounts: Record<string, number> = {};
  await Promise.all(
    destinations.map(async (d) => {
      const facilities = await api.listFacilities(d.id).catch(() => []);
      accessibleCounts[d.id] = facilities.filter((f) => _ACCESSIBILITY_FACILITY_TYPES.has(f.facility_type)).length;
    })
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Destinations</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real seeded destinations with live safety scores and crowd signal. Hit{" "}
          <span className="font-medium text-primary">Feel it</span> on any card for a live, immersive look.
        </p>
      </div>
      {destinations.length === 0 ? (
        <EmptyState title="No destinations yet." />
      ) : (
        <DestinationsGrid destinations={destinations} accessibleCounts={accessibleCounts} />
      )}
    </div>
  );
}
