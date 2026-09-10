"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  type MeGamification,
  type Challenge,
  type LeaderboardEntry,
  type Destination,
  type Badge,
  type GamificationCategory,
} from "@/lib/api";
import { StarIcon, CompassIcon, SparkleIcon } from "@/components/icons";

const CATEGORY_LABELS: Record<string, string> = {
  EXPLORATION: "Exploration",
  HERITAGE: "Heritage",
  LOCAL_ECONOMY: "Local economy",
  RESPONSIBLE_TOURISM: "Responsible tourism",
  COMMUNITY: "Community",
};

const LEADERBOARD_VIEWS: { value: GamificationCategory | ""; label: string }[] = [
  { value: "", label: "Overall" },
  { value: "RESPONSIBLE_TOURISM", label: "🌱 Green tourism" },
  { value: "EXPLORATION", label: "Exploration" },
  { value: "LOCAL_ECONOMY", label: "Local economy" },
  { value: "HERITAGE", label: "Heritage" },
  { value: "COMMUNITY", label: "Community" },
];

function categoryTone(category: string) {
  switch (category) {
    case "EXPLORATION":
      return "bg-primary/10 text-primary";
    case "LOCAL_ECONOMY":
      return "bg-success/10 text-success";
    case "COMMUNITY":
      return "bg-accent/10 text-accent";
    default:
      return "bg-surface-muted text-foreground/60";
  }
}

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${categoryTone(badge.category)}`}>
        <StarIcon width={18} height={18} />
      </span>
      <div className="min-w-0">
        <div className="font-medium">{badge.name}</div>
        <div className="truncate text-sm text-foreground/55">{badge.description}</div>
      </div>
    </div>
  );
}

function ChallengeRow({ challenge }: { challenge: Challenge }) {
  const pct = Math.min(100, Math.round((challenge.my_progress_count / challenge.target_count) * 100));
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{challenge.name}</div>
        {challenge.my_completed_at ? (
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Completed</span>
        ) : (
          <span className="text-xs text-foreground/55">
            {challenge.my_progress_count}/{challenge.target_count}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-foreground/60">{challenge.description}</p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-foreground/45">
        Reward: {challenge.points_reward} pts{challenge.badge ? ` + "${challenge.badge.name}" badge` : ""}
      </p>
    </li>
  );
}

function CheckInWidget({ onCheckedIn }: { onCheckedIn: () => void }) {
  const { token } = useAuth();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listDestinations().then((d) => {
      setDestinations(d);
      if (d.length > 0) setSelected(d[0].id);
    });
  }, []);

  function submitCheckIn() {
    if (!token || !selected) return;
    if (!navigator.geolocation) {
      setStatus("Your browser doesn't support geolocation.");
      return;
    }
    setBusy(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await api.checkIn(
            { destination_id: selected, lon: position.coords.longitude, lat: position.coords.latitude },
            token
          );
          setStatus(
            result.points_awarded > 0
              ? `Checked in! +${result.points_awarded} pts${result.new_badges.length ? ` — earned "${result.new_badges[0].name}"` : ""}`
              : "Checked in again — points already earned for this destination."
          );
          onCheckedIn();
        } catch (err) {
          setStatus(isApiError(err) ? err.message : "Could not check in.");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setStatus("Location access was denied — check-in needs your real GPS position to verify you're actually there.");
        setBusy(false);
      }
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 font-medium">
        <CompassIcon width={16} height={16} className="text-primary" />
        Check in at a destination
      </div>
      <p className="mt-1 text-sm text-foreground/60">
        Real GPS-verified check-ins — you need to actually be near the place (within 5km) to earn points.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          onClick={submitCheckIn}
          disabled={busy || !selected}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Checking in…" : "Check in here"}
        </button>
      </div>
      {status && <p className="mt-2 text-sm text-foreground/70">{status}</p>}
    </div>
  );
}

function GamificationHome() {
  const { token } = useAuth();
  const [me, setMe] = useState<MeGamification | null>(null);
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [leaderboardView, setLeaderboardView] = useState<GamificationCategory | "">("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!token) return;
    api.getMyGamification(token).then(setMe).catch(() => setError("Could not load your points/badges."));
    api.listChallenges(token).then(setChallenges).catch(() => {});
  }

  useEffect(refresh, [token]);
  useEffect(() => {
    api
      .getLeaderboard(leaderboardView || undefined)
      .then(setLeaderboard)
      .catch(() => setLeaderboard([]));
  }, [leaderboardView]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your Travel Passport</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real points and badges earned from real check-ins, verified bookings, and reviews — nothing here is fabricated.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm text-foreground/55">Total points</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{me?.points.total_points ?? "—"}</div>
          {me && Object.keys(me.points.by_category).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(me.points.by_category).map(([category, points]) => (
                <span key={category} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryTone(category)}`}>
                  {CATEGORY_LABELS[category] ?? category} {points}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm text-foreground/55">Destinations visited</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{me?.destinations_visited ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm text-foreground/55">Badges earned</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{me?.badges.length ?? "—"}</div>
        </div>
      </div>

      <CheckInWidget onCheckedIn={refresh} />

      <div>
        <h2 className="text-lg font-semibold">Your badges</h2>
        {me?.badges.length === 0 && <p className="mt-2 text-sm text-foreground/60">No badges yet — check in somewhere to earn your first one.</p>}
        {me && me.badges.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {me.badges.map((ub) => (
              <BadgeChip key={ub.badge.id} badge={ub.badge} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Challenges</h2>
        {challenges === null && <p className="mt-2 text-sm text-foreground/60">Loading…</p>}
        {challenges && (
          <ul className="mt-3 flex flex-col gap-3">
            {challenges.map((c) => (
              <ChallengeRow key={c.id} challenge={c} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <div className="flex flex-wrap gap-1 rounded-full bg-surface-muted p-1 text-xs">
            {LEADERBOARD_VIEWS.map((v) => (
              <button
                key={v.value || "overall"}
                onClick={() => setLeaderboardView(v.value)}
                className={`rounded-full px-2.5 py-1 transition ${
                  leaderboardView === v.value ? "bg-surface font-medium shadow-sm" : "text-foreground/60"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        {leaderboardView === "RESPONSIBLE_TOURISM" && (
          <p className="mt-1 flex items-center gap-1 text-xs text-foreground/50">
            <SparkleIcon width={11} height={11} className="text-accent" />
            Points from eco-certified bookings and other responsible-tourism actions only.
          </p>
        )}
        {leaderboard === null && <p className="mt-2 text-sm text-foreground/60">Loading…</p>}
        {leaderboard && leaderboard.length === 0 && (
          <p className="mt-2 text-sm text-foreground/60">No one&apos;s on the board yet — be the first to earn points.</p>
        )}
        {leaderboard && leaderboard.length > 0 && (
          <ol className="mt-3 flex flex-col gap-2">
            {leaderboard.map((entry) => (
              <li key={entry.rank} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold">
                  {entry.rank}
                </span>
                <span className="flex-1 text-sm">{entry.display_name}</span>
                <span className="flex items-center gap-1 text-sm font-medium text-foreground/70">
                  <StarIcon width={12} height={12} />
                  {entry.total_points} pts
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default function GamificationPage() {
  return (
    <RequireAuth>
      <GamificationHome />
    </RequireAuth>
  );
}
