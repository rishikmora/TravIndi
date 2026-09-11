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
  type PointsHistoryEntry,
  type VisitedDestination,
  type MyRank,
} from "@/lib/api";
import { StarIcon, CompassIcon, SparkleIcon, MapPinIcon, ClockIcon } from "@/components/icons";
import { ListSkeleton } from "@/components/Skeleton";

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

function BadgeCollectionChip({ badge, awardedAt }: { badge: Badge; awardedAt: string | null }) {
  const earned = awardedAt !== null;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-4 ${
        earned ? "border-border bg-surface" : "border-dashed border-border bg-surface-muted/40"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          earned ? categoryTone(badge.category) : "bg-surface-muted text-foreground/35"
        }`}
      >
        <StarIcon width={18} height={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`font-medium ${earned ? "" : "text-foreground/60"}`}>{badge.name}</div>
        <div className="truncate text-sm text-foreground/55">{badge.description}</div>
        <div className={`mt-0.5 text-xs ${earned ? "text-success" : "text-foreground/55"}`}>
          {earned ? `Earned ${new Date(awardedAt).toLocaleDateString()}` : `Locked · worth ${badge.points_value} pts`}
        </div>
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
      <p className="mt-2 text-xs text-foreground/55">
        Reward: {challenge.points_reward} pts{challenge.badge ? ` + "${challenge.badge.name}" badge` : ""}
      </p>
    </li>
  );
}

function VisitedDestinationRow({ visit }: { visit: VisitedDestination }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MapPinIcon width={14} height={14} />
      </span>
      <span className="flex-1 text-sm font-medium">{visit.destination_name}</span>
      <span className="shrink-0 text-xs text-foreground/50">
        First visited {new Date(visit.first_checked_in_at).toLocaleDateString()}
        {visit.check_in_count > 1 ? ` · ${visit.check_in_count} check-ins` : ""}
      </span>
    </li>
  );
}

function PointsHistoryRow({ entry }: { entry: PointsHistoryEntry }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryTone(entry.category)}`}>
        {CATEGORY_LABELS[entry.category] ?? entry.category}
      </span>
      <span className="flex-1 truncate text-sm text-foreground/75">{entry.reason}</span>
      <span className="shrink-0 text-xs text-foreground/55">{new Date(entry.created_at).toLocaleDateString()}</span>
      <span className="shrink-0 text-sm font-semibold text-success">+{entry.points}</span>
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
  const [allBadges, setAllBadges] = useState<Badge[] | null>(null);
  const [visitedDestinations, setVisitedDestinations] = useState<VisitedDestination[] | null>(null);
  const [pointsHistory, setPointsHistory] = useState<PointsHistoryEntry[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [leaderboardView, setLeaderboardView] = useState<GamificationCategory | "">("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!token) return;
    api.getMyGamification(token).then(setMe).catch(() => setError("Could not load your points/badges."));
    api.listChallenges(token).then(setChallenges).catch(() => {});
    api.listMyCheckIns(token).then(setVisitedDestinations).catch(() => setVisitedDestinations([]));
    api.listMyPointsHistory(token).then(setPointsHistory).catch(() => setPointsHistory([]));
  }

  useEffect(refresh, [token]);
  useEffect(() => {
    api.listBadges().then(setAllBadges).catch(() => setAllBadges([]));
  }, []);
  useEffect(() => {
    api
      .getLeaderboard(leaderboardView || undefined)
      .then(setLeaderboard)
      .catch(() => setLeaderboard([]));
    if (!token) return;
    api
      .getMyLeaderboardRank(leaderboardView || undefined, token)
      .then(setMyRank)
      .catch(() => setMyRank(null));
  }, [leaderboardView, token]);

  const earnedAwardedAt: Record<string, string> = {};
  if (me) for (const ub of me.badges) earnedAwardedAt[ub.badge.id] = ub.awarded_at;

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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Badge collection</h2>
          {allBadges && me && (
            <span className="text-xs text-foreground/50">
              {me.badges.length} of {allBadges.length} earned
            </span>
          )}
        </div>
        {allBadges === null && <ListSkeleton count={3} className="mt-2" />}
        {allBadges && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {allBadges.map((b) => (
              <BadgeCollectionChip key={b.id} badge={b} awardedAt={earnedAwardedAt[b.id] ?? null} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Places you&apos;ve visited</h2>
        {visitedDestinations === null && <ListSkeleton count={2} className="mt-2" />}
        {visitedDestinations && visitedDestinations.length === 0 && (
          <p className="mt-2 text-sm text-foreground/60">No real GPS-verified visits yet — check in above once you&apos;re there.</p>
        )}
        {visitedDestinations && visitedDestinations.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {visitedDestinations.map((v) => (
              <VisitedDestinationRow key={v.destination_id} visit={v} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Challenges</h2>
        {challenges === null && <ListSkeleton count={2} className="mt-2" />}
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
        {myRank && (
          <p className="mt-2 rounded-xl bg-primary/5 px-3 py-2 text-sm text-primary">
            {myRank.rank !== null
              ? `You're ranked #${myRank.rank} with ${myRank.total_points} pts${leaderboardView ? " in this category" : ""}.`
              : "You haven't earned any points in this category yet."}
          </p>
        )}
        {leaderboard === null && <ListSkeleton count={3} className="mt-2" />}
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

      <div>
        <div className="flex items-center gap-2">
          <ClockIcon width={16} height={16} className="text-foreground/50" />
          <h2 className="text-lg font-semibold">Recent activity</h2>
        </div>
        {pointsHistory === null && <ListSkeleton count={3} className="mt-2" />}
        {pointsHistory && pointsHistory.length === 0 && (
          <p className="mt-2 text-sm text-foreground/60">No points earned yet.</p>
        )}
        {pointsHistory && pointsHistory.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {pointsHistory.map((entry) => (
              <PointsHistoryRow key={entry.id} entry={entry} />
            ))}
          </ul>
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
