"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  type AccessibilityNeed,
  type CrowdCell,
  type Destination,
  type Facility,
  type SafetyScore,
  type TravelerType,
} from "@/lib/api";
import { MapPinIcon, ShieldIcon, SparkleIcon } from "@/components/icons";

const PROGRESS_STEPS = [
  "Understanding your preferences",
  "Checking crowd conditions",
  "Evaluating safety data",
  "Calculating routes and distances",
  "Optimizing your budget",
  "Building your itinerary",
];

// Lowercase — matches the real values app/db/seed.py actually wrote, not
// FacilityCreateIn's uppercase Literal (see backend/app/domains/travel/
// routing.py's identical constant for the full explanation).
const _ACCESSIBILITY_FACILITY_TYPES = new Set(["wheelchair_ramp", "accessible_toilet", "elevator", "accessible_parking", "wheelchair_rental"]);

const TRAVELER_TYPES: { value: TravelerType; label: string }[] = [
  { value: "SOLO", label: "Solo" },
  { value: "ACCESSIBILITY", label: "Accessibility needs" },
  { value: "FAMILY", label: "Family" },
];

const NEEDS: { value: AccessibilityNeed; label: string }[] = [
  { value: "WHEELCHAIR", label: "Wheelchair" },
  { value: "VISUAL_IMPAIRMENT", label: "Visual impairment" },
  { value: "HEARING_IMPAIRMENT", label: "Hearing impairment" },
  { value: "REDUCED_MOBILITY", label: "Reduced mobility" },
];

function crowdLabel(density: number | null | undefined) {
  if (density == null) return null;
  if (density >= 0.75) return "High";
  if (density >= 0.4) return "Moderate";
  return "Low";
}

function DestinationSnapshot({
  destination,
  showAccessibility,
}: {
  destination: Destination | undefined;
  showAccessibility: boolean;
}) {
  const [safety, setSafety] = useState<SafetyScore | null>(null);
  const [crowd, setCrowd] = useState<CrowdCell[]>([]);
  const [attractionCount, setAttractionCount] = useState<number | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    if (!destination) return;
    Promise.all([
      api.getDestinationSafety(destination.id).catch(() => null),
      api.getDestinationCrowd(destination.id).catch(() => []),
      api.listAttractions(destination.id).catch(() => []),
      api.listFacilities(destination.id).catch(() => []),
    ]).then(([s, c, attractions, f]) => {
      setSafety(s);
      setCrowd(c);
      setAttractionCount(attractions.length);
      setFacilities(f);
    });
  }, [destination]);

  if (!destination) return null;
  const density = crowd[0]?.density ?? null;
  const label = crowdLabel(density);
  const accessibleFacilityCount = facilities.filter((f) => _ACCESSIBILITY_FACILITY_TYPES.has(f.facility_type)).length;

  return (
    <div className="flex h-full flex-col rounded-3xl border border-border bg-ink-2 p-7 text-[#F5EFE3] sm:p-8">
      <span className="text-[11px] font-bold tracking-[0.25em] text-gold">LIVE INTELLIGENCE</span>
      <h2 className="mt-3 font-display text-2xl">{destination.name}</h2>
      <p className="mt-1 flex items-center gap-1 text-sm text-[#C8D3DE]">
        <MapPinIcon width={13} height={13} />
        {[destination.city, destination.state].filter(Boolean).join(", ")}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[#9FD4B0]">
            <ShieldIcon width={12} height={12} />
            SAFETY
          </div>
          <div className="mt-1.5 font-display text-2xl">
            {safety ? Math.round(safety.score * 100) : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[10px] font-bold tracking-[0.14em] text-gold">CROWD</div>
          <div className="mt-1.5 font-display text-2xl">{label ?? "—"}</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="text-[10px] font-bold tracking-[0.14em] text-[#9FB0BE]">ATTRACTIONS SEEDED</div>
        <div className="mt-1.5 font-display text-2xl">{attractionCount ?? "—"}</div>
      </div>

      {showAccessibility && (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <div className="text-[10px] font-bold tracking-[0.14em] text-[#9FD4B0]">REAL ACCESSIBLE FACILITIES HERE</div>
          <div className="mt-1.5 font-display text-2xl">{accessibleFacilityCount}</div>
          <div className="mt-0.5 text-xs text-[#8AA0B0]">
            Wheelchair ramps, accessible toilets, elevators & accessible parking — the planner
            weighs real distance to these for every pick.
          </div>
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-[#8AA0B0]">
        This snapshot is real, live data from the same destination the planner will
        ground your itinerary in — not a preview mockup.
      </p>
    </div>
  );
}

function PlanWithAiForm() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedDestinationId = searchParams.get("destination");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [budget, setBudget] = useState("");
  const [travelerType, setTravelerType] = useState<TravelerType>("SOLO");
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<AccessibilityNeed[]>([]);
  const [familyChildren, setFamilyChildren] = useState(0);
  const [familySeniors, setFamilySeniors] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    api.listDestinations().then((list) => {
      setDestinations(list);
      if (preselectedDestinationId && list.some((d) => d.id === preselectedDestinationId)) {
        setDestinationId(preselectedDestinationId);
      } else if (list.length > 0) {
        setDestinationId(list[0].id);
      }
    });
  }, [preselectedDestinationId]);

  useEffect(() => {
    if (!token) return;
    api
      .getTravelPreferences(token)
      .then((prefs) => {
        setTravelerType(prefs.traveler_type);
        setAccessibilityNeeds(prefs.accessibility_needs);
        setFamilyChildren(prefs.family_children_count);
        setFamilySeniors(prefs.family_seniors_count);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!submitting) return;
    const id = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, PROGRESS_STEPS.length - 1));
    }, 900);
    return () => clearInterval(id);
  }, [submitting]);

  const selectedDestination = destinations.find((d) => d.id === destinationId);

  function toggleNeed(need: AccessibilityNeed) {
    setAccessibilityNeeds((prev) => (prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !destinationId) return;
    setError(null);
    setStepIndex(0);
    setSubmitting(true);
    try {
      const itinerary = await api.planTripWithAi(
        {
          destination_id: destinationId,
          prompt,
          budget: budget ? Number(budget) : undefined,
          traveler_type: travelerType,
          accessibility_needs: travelerType === "ACCESSIBILITY" ? accessibilityNeeds : [],
          family_children_count: travelerType === "FAMILY" ? familyChildren : undefined,
          family_seniors_count: travelerType === "FAMILY" ? familySeniors : undefined,
        },
        token
      );
      router.push(`/trips/${itinerary.trip_id}`);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not plan this trip.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="overflow-hidden rounded-3xl bg-ink">
        <div className="px-8 py-10 sm:px-10 sm:py-12">
          <span className="text-[11px] font-bold tracking-[0.3em] text-gold">PLAN YOUR JOURNEY</span>
          <h1 className="mt-3 font-display text-3xl leading-tight text-[#F5EFE3] sm:text-[38px]">
            With your AI travel copilot
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#C8D3DE]">
            Tell us where you want to go and what you&apos;re looking for — a real
            Claude-powered planner grounded in that destination&apos;s attractions
            builds a day-by-day itinerary.
          </p>

          <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-gold/35 bg-white/[0.04] p-5">
            <label className="text-[11px] font-bold tracking-[0.16em] text-gold">WHO&apos;S TRAVELING?</label>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {TRAVELER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={submitting}
                  onClick={() => setTravelerType(t.value)}
                  className={`rounded-full border px-2 py-1.5 text-xs font-semibold transition ${
                    travelerType === t.value
                      ? "border-gold bg-gold text-ink"
                      : "border-white/15 text-[#C8D3DE] hover:bg-white/5"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {travelerType === "ACCESSIBILITY" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {NEEDS.map((n) => (
                  <label
                    key={n.value}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      accessibilityNeeds.includes(n.value)
                        ? "border-accent bg-accent/15 text-[#9FD4B0]"
                        : "border-white/15 text-[#C8D3DE]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={accessibilityNeeds.includes(n.value)}
                      onChange={() => toggleNeed(n.value)}
                    />
                    {n.label}
                  </label>
                ))}
              </div>
            )}
            {travelerType === "FAMILY" && (
              <div className="mt-2 flex gap-3 text-xs text-[#C8D3DE]">
                <label className="flex items-center gap-1.5">
                  Children
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={familyChildren}
                    onChange={(e) => setFamilyChildren(Number(e.target.value))}
                    className="w-14 rounded-full border border-white/15 bg-transparent px-2 py-1 text-center"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  Seniors
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={familySeniors}
                    onChange={(e) => setFamilySeniors(Number(e.target.value))}
                    className="w-14 rounded-full border border-white/15 bg-transparent px-2 py-1 text-center"
                  />
                </label>
              </div>
            )}

            <label className="mt-4 block text-[11px] font-bold tracking-[0.16em] text-gold">DESTINATION</label>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              required
              disabled={submitting}
              className="mt-2 w-full rounded-xl border border-white/15 bg-ink-2 px-3 py-2.5 text-sm text-[#F5EFE3] focus:outline-none focus:ring-2 focus:ring-gold/50"
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.id} className="text-foreground">
                  {d.name}
                  {d.state ? ` — ${d.state}` : ""}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-[11px] font-bold tracking-[0.16em] text-gold">
              WHAT KIND OF JOURNEY ARE YOU IMAGINING?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={4}
              disabled={submitting}
              placeholder="e.g. I'm travelling with my wheelchair — keep it relaxed and avoid crowds."
              className="mt-2 w-full rounded-xl border border-white/15 bg-ink-2 px-3 py-2.5 font-display text-lg leading-snug text-[#F5EFE3] placeholder:text-[#6D8296] placeholder:font-sans placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                disabled={submitting}
                placeholder="Budget (₹, optional)"
                className="w-44 rounded-full border border-white/15 bg-transparent px-4 py-1.5 text-xs text-[#C8D3DE] placeholder:text-[#6D8296] focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
              {selectedDestination && (
                <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-[#C8D3DE]">
                  {selectedDestination.name}
                </span>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting || !destinationId}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold px-6 py-3 text-sm font-bold text-ink transition disabled:opacity-60"
              >
                {submitting ? "Designing your journey…" : "Create journey"}
                {!submitting && <SparkleIcon width={14} height={14} />}
              </button>
              <span className="text-xs text-[#6D8296]">Usually takes a few seconds</span>
            </div>
          </form>

          {submitting && (
            <div className="mt-5 rounded-2xl border border-accent/45 bg-accent/10 p-5">
              <div className="flex items-center gap-2">
                <SparkleIcon width={14} height={14} className="text-gold" />
                <span className="text-[13px] font-bold tracking-[0.08em] text-[#F5EFE3]">
                  YOUR JOURNEY IS BEING DESIGNED
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[#DCE5EC]">
                {PROGRESS_STEPS.map((step, i) => (
                  <div key={step} className={i > stepIndex ? "text-[#6D8296]" : ""}>
                    {i < stepIndex ? "✓ " : i === stepIndex ? "◷ " : "· "}
                    {step}
                  </div>
                ))}
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-accent to-gold transition-all"
                  style={{ width: `${Math.min(((stepIndex + 1) / PROGRESS_STEPS.length) * 100, 96)}%` }}
                />
              </div>
              <div className="mt-2 flex text-[11px] text-[#6D8296]">
                <span>Grounding against {destinations.length} seeded destinations</span>
              </div>
            </div>
          )}
          <p className="mt-4 text-center text-xs text-[#6D8296]">
            Uses your saved accessibility and safety preferences where available.
          </p>
        </div>
      </div>

      <DestinationSnapshot
        key={selectedDestination?.id ?? "none"}
        destination={selectedDestination}
        showAccessibility={travelerType === "ACCESSIBILITY"}
      />
    </div>
  );
}

export default function PlanWithAiPage() {
  return (
    <RequireAuth>
      <PlanWithAiForm />
    </RequireAuth>
  );
}
