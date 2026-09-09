"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  type Attraction,
  type CrowdCell,
  type Destination,
  type DestinationWeather,
  type ExploreResult,
  type SafetyScore,
} from "@/lib/api";
import { ArrowRightIcon, CrowdIcon, MapPinIcon, ShieldIcon, SparkleIcon } from "@/components/icons";

function crowdLabel(density: number | null | undefined) {
  if (density == null) return null;
  if (density >= 0.75) return "Bustling";
  if (density >= 0.4) return "Lively";
  return "Calm";
}

const REVEAL_STEPS = 4;

// Module-level, not component state: React's dev-mode Strict Mode
// double-invokes effects (mount → cleanup → mount), which would otherwise
// fire this real POST twice per open and let whichever response resolves
// last (usually the second, correctly-deduped "already explored" one) win
// the render — even on a genuine first visit. A plain Set survives that
// synthetic remount since it isn't tied to the component instance.
const explorePosted = new Set<string>();

export function DestinationExperience({ destination, onClose }: { destination: Destination; onClose: () => void }) {
  const { token } = useAuth();
  const [weather, setWeather] = useState<DestinationWeather | null>(null);
  const [safety, setSafety] = useState<SafetyScore | null>(null);
  const [crowd, setCrowd] = useState<CrowdCell[]>([]);
  const [attractions, setAttractions] = useState<Attraction[] | null>(null);
  const [explore, setExplore] = useState<ExploreResult | null>(null);
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    Promise.all([
      api.getDestinationWeather(destination.id).catch(() => null),
      api.getDestinationSafety(destination.id).catch(() => null),
      api.getDestinationCrowd(destination.id).catch(() => []),
      api.listAttractions(destination.id).catch(() => []),
    ]).then(([w, s, c, a]) => {
      setWeather(w);
      setSafety(s);
      setCrowd(c);
      setAttractions(a);
    });
  }, [destination.id]);

  useEffect(() => {
    if (!token) return;
    const key = `${token}:${destination.id}`;
    if (explorePosted.has(key)) return;
    explorePosted.add(key);
    api
      .exploreDestination(destination.id, token)
      .then(setExplore)
      .catch(() => {})
      .finally(() => explorePosted.delete(key));
  }, [destination.id, token]);

  useEffect(() => {
    const id = setInterval(() => setRevealStep((s) => Math.min(s + 1, REVEAL_STEPS)), 350);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const density = crowd[0]?.density ?? null;

  const cards = [
    weather && weather.temperature_c != null
      ? {
          label: "RIGHT NOW",
          value: `${Math.round(weather.temperature_c)}°C`,
          detail: `${weather.condition} · ${weather.is_day ? "Daytime" : "Nighttime"} there`,
        }
      : null,
    safety
      ? { label: "SAFETY SCORE", value: `${Math.round(safety.score * 100)}`, detail: "Out of 100, real-time" }
      : null,
    density != null
      ? { label: "CROWD", value: crowdLabel(density) ?? "—", detail: `${Math.round(density * 100)}% of capacity` }
      : null,
    attractions
      ? {
          label: "TO DISCOVER",
          value: String(attractions.length),
          detail: attractions.length > 0 ? attractions.map((a) => a.name).slice(0, 2).join(", ") : "Seeded attractions",
        }
      : null,
  ].filter((c): c is { label: string; value: string; detail: string } => c !== null);

  const revealedCount = Math.min(revealStep, cards.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Feel ${destination.name}`}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="washed relative h-64 w-full shrink-0 sm:h-80">
          {destination.image_url ? (
            <Image src={destination.image_url} alt={destination.name} fill sizes="672px" className="object-cover" priority />
          ) : (
            <div className="absolute inset-0 bg-ink-2" />
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(8,26,47,.1) 0%, rgba(8,26,47,.45) 55%, rgba(8,26,47,.95) 100%)" }}
          />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-lg text-[#F5EFE3] backdrop-blur hover:bg-black/45"
          >
            ×
          </button>
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-6">
            <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.28em] text-gold">
              <SparkleIcon width={12} height={12} />
              FEEL THE PLACE
            </span>
            <h2 className="font-display text-3xl text-[#F5EFE3] sm:text-4xl">{destination.name}</h2>
            <p className="flex items-center gap-1 text-sm text-[#DCE5EC]">
              <MapPinIcon width={13} height={13} />
              {[destination.city, destination.state].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-6 sm:p-8">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold tracking-[0.14em] text-gold">
              <span>DISCOVERING {destination.name.toUpperCase()}</span>
              <span>
                {revealedCount}/{Math.max(cards.length, 1)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-accent to-gold transition-all duration-500"
                style={{ width: `${cards.length > 0 ? (revealedCount / cards.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {cards.length === 0 && (
              <p className="col-span-2 text-sm text-[#8AA0B0]">
                Real-time signal for this destination isn&apos;t available yet.
              </p>
            )}
            {cards.map((card, i) => (
              <div
                key={card.label}
                className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-all duration-500 ${
                  i < revealedCount ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[#9FB0BE]">
                  {card.label === "SAFETY SCORE" && <ShieldIcon width={11} height={11} />}
                  {card.label === "CROWD" && <CrowdIcon width={11} height={11} />}
                  {card.label}
                </div>
                <div className="mt-1 font-display text-2xl text-[#F5EFE3]">{card.value}</div>
                <div className="mt-0.5 text-xs text-[#8AA0B0]">{card.detail}</div>
              </div>
            ))}
          </div>

          {token ? (
            explore && (
              <p className="text-xs text-[#8AA0B0]">
                {explore.points_awarded > 0
                  ? `+${explore.points_awarded} exploration points earned — your first time feeling this place.`
                  : "You've already earned exploration points here."}
              </p>
            )
          ) : (
            <p className="text-xs text-[#8AA0B0]">Log in to earn real exploration points for visiting this page.</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
            <Link
              href={`/trips/plan?destination=${destination.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-ink hover:opacity-90"
            >
              Plan a trip here
              <ArrowRightIcon width={13} height={13} />
            </Link>
            <Link
              href={`/destinations/${destination.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-[#F5EFE3] hover:bg-white/5"
            >
              Full details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
