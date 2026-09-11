import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { ArrowRightIcon, CalendarIcon, CrowdIcon, MapPinIcon, ShieldIcon, SparkleIcon } from "@/components/icons";
import { AddFacilityForm } from "./AddFacilityForm";
import { HeritageStory } from "./HeritageStory";
import { DiscussionThread } from "./DiscussionThread";

export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 0.7) return "text-success";
  if (score >= 0.4) return "text-primary";
  return "text-danger";
}

// Lowercase — matches the real values app/db/seed.py actually wrote, not
// FacilityCreateIn's uppercase Literal (see backend/app/domains/travel/
// routing.py for the full explanation of this case mismatch). Falls back
// to the raw value for any type not listed here, so a mismatch is never
// silently invisible.
const FACILITY_LABELS: Record<string, string> = {
  wheelchair_ramp: "Wheelchair ramp",
  wheelchair_rental: "Wheelchair rental",
  accessible_toilet: "Accessible toilet",
  elevator: "Elevator",
  accessible_parking: "Accessible parking",
  first_aid_post: "First aid post",
  information_desk: "Information desk",
  drinking_water: "Drinking water",
  other: "Other facility",
};

const _ACCESSIBILITY_FACILITY_TYPES = new Set([
  "wheelchair_ramp",
  "wheelchair_rental",
  "accessible_toilet",
  "elevator",
  "accessible_parking",
]);

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

  const [attractions, safety, crowd, facilities, demand, events, overtourism] = await Promise.all([
    api.listAttractions(id),
    api.getDestinationSafety(id).catch(() => null),
    api.getDestinationCrowd(id).catch(() => []),
    api.listFacilities(id).catch(() => []),
    api.getDemandForecast(id).catch(() => null),
    api.listTourismEvents(id).catch(() => []),
    api.getOvertourismSignal(id).catch(() => null),
  ]);
  const { lon, lat } = destination.location;
  const accessibleFacilityCount = facilities.filter((f) => _ACCESSIBILITY_FACILITY_TYPES.has(f.facility_type)).length;

  return (
    <div className="flex flex-col gap-8">
      {destination.image_url ? (
        <div className="washed relative -mx-4 h-64 overflow-hidden rounded-b-3xl sm:mx-0 sm:h-80 sm:rounded-3xl">
          <Image
            src={destination.image_url}
            alt={destination.name}
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(8,26,47,.05) 0%, rgba(8,26,47,.35) 60%, rgba(8,26,47,.85) 100%)" }}
          />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6 sm:p-8">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-[#F5EFE3] backdrop-blur">
              <MapPinIcon width={14} height={14} />
              Destination
            </span>
            <h1 className="font-display text-3xl text-[#F5EFE3] sm:text-4xl">{destination.name}</h1>
            <p className="text-[#DCE5EC]">{[destination.city, destination.state].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <MapPinIcon width={14} height={14} />
            Destination
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">{destination.name}</h1>
          <p className="text-foreground/60">{[destination.city, destination.state].filter(Boolean).join(", ")}</p>
        </div>
      )}

      {(safety || crowd.length > 0 || accessibleFacilityCount > 0) && (
        <section className="grid gap-4 sm:grid-cols-3">
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
          {accessibleFacilityCount > 0 && (
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent text-xl">
                ♿
              </span>
              <div>
                <div className="text-sm text-foreground/60">Accessible facilities</div>
                <div className="text-2xl font-semibold text-accent">{accessibleFacilityCount}</div>
              </div>
            </div>
          )}
        </section>
      )}

      {overtourism?.is_overtouristed && (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <span className="font-medium">Overtourism signal:</span> current crowd density (
          {((overtourism.latest_density ?? 0) * 100).toFixed(0)}%) is above the {(overtourism.threshold * 100).toFixed(0)}%
          threshold — expect heavier crowds and consider visiting at a quieter time.
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-muted p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Ready to plan?</h2>
          <p className="text-sm text-foreground/65">Let the AI planner build a day-by-day itinerary here.</p>
        </div>
        <Link
          href={`/trips/plan?destination=${destination.id}`}
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

      <HeritageStory destinationId={id} />

      {events.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-medium">
            <CalendarIcon width={16} height={16} />
            Cultural calendar
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
                <div className="font-medium">{e.name}</div>
                <div className="mt-0.5 text-foreground/55">
                  {new Date(e.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {e.ends_at !== e.starts_at &&
                    ` – ${new Date(e.ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      <DiscussionThread destinationId={id} />
    </div>
  );
}
