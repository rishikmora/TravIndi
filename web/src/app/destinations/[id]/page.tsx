import { notFound } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { ArrowRightIcon, CrowdIcon, MapPinIcon, ShieldIcon, SparkleIcon } from "@/components/icons";
import { AddFacilityForm } from "./AddFacilityForm";

export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 0.7) return "text-success";
  if (score >= 0.4) return "text-primary";
  return "text-danger";
}

const FACILITY_LABELS: Record<string, string> = {
  WHEELCHAIR_RAMP: "Wheelchair ramp",
  ACCESSIBLE_TOILET: "Accessible toilet",
  ELEVATOR: "Elevator",
  ACCESSIBLE_PARKING: "Accessible parking",
  FIRST_AID: "First aid",
  INFORMATION_DESK: "Information desk",
  DRINKING_WATER: "Drinking water",
  OTHER: "Other facility",
};

export default async function DestinationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let destination;
  try {
    destination = await api.getDestination(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [attractions, safety, crowd, facilities, demand] = await Promise.all([
    api.listAttractions(id),
    api.getDestinationSafety(id).catch(() => null),
    api.getDestinationCrowd(id).catch(() => []),
    api.listFacilities(id).catch(() => []),
    api.getDemandForecast(id).catch(() => null),
  ]);
  const { lon, lat } = destination.location;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <MapPinIcon width={14} height={14} />
          Destination
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{destination.name}</h1>
        <p className="text-foreground/60">{[destination.city, destination.state].filter(Boolean).join(", ")}</p>
      </div>

      {(safety || crowd.length > 0) && (
        <section className="grid gap-4 sm:grid-cols-2">
          {safety && (
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success/10 text-success">
                <ShieldIcon width={20} height={20} />
              </span>
              <div>
                <div className="text-sm text-foreground/60">Safety score</div>
                <div className={`text-2xl font-semibold ${scoreTone(safety.score)}`}>
                  {(safety.score * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          )}
          {crowd.length > 0 && (
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CrowdIcon width={20} height={20} />
              </span>
              <div>
                <div className="text-sm text-foreground/60">Crowd risk</div>
                <div className={`text-2xl font-semibold ${scoreTone(1 - (crowd[0].risk_score ?? 0))}`}>
                  {((crowd[0].risk_score ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-muted p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Ready to plan?</h2>
          <p className="text-sm text-foreground/65">Let the AI planner build a day-by-day itinerary here.</p>
        </div>
        <Link
          href="/trips/plan"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Plan with AI
          <ArrowRightIcon width={14} height={14} />
        </Link>
      </section>

      {demand && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2">
            <SparkleIcon width={16} height={16} className="text-accent" />
            <h2 className="font-medium">Planning activity</h2>
          </div>
          <p className="mt-1 text-xs text-foreground/50">
            A real heuristic from actual trips and bookings — not a trained forecasting model.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xl font-semibold">{demand.planned_visits_next_30_days}</div>
              <div className="text-xs text-foreground/60">Planned visits (30d)</div>
            </div>
            <div>
              <div className="text-xl font-semibold">{demand.confirmed_bookings_next_30_days}</div>
              <div className="text-xs text-foreground/60">Confirmed bookings (30d)</div>
            </div>
            <div>
              <div className="text-xl font-semibold">{demand.recent_planning_momentum_7_days}</div>
              <div className="text-xs text-foreground/60">New plans (7d)</div>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Accessibility & facilities</h2>
        </div>
        <div className="mb-3">
          <AddFacilityForm destinationId={id} lon={lon} lat={lat} />
        </div>
        {facilities.length === 0 ? (
          <p className="text-sm text-foreground/60">No facility information recorded yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {facilities.map((f) => (
              <li key={f.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-foreground/55">{FACILITY_LABELS[f.facility_type] ?? f.facility_type}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Attractions</h2>
        {attractions.length === 0 ? (
          <p className="text-sm text-foreground/60">No attractions listed yet for this destination.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {attractions.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
                <div className="font-medium">{a.name}</div>
                {a.category && <div className="mt-0.5 text-foreground/55">{a.category}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
