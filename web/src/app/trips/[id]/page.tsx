"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  NetworkError,
  type Trip,
  type Itinerary,
  type ItineraryItem,
  type Destination,
  type Attraction,
  type Business,
  type Expense,
  type ExpenseCategory,
  type TripFinancialSummary,
  type TripMember,
  type GroupSafety,
  type CarbonFootprint,
  type QuickReplanAction,
  type AdaptationProposal,
} from "@/lib/api";
import { cacheItinerary, cacheTrip, getCachedItinerary, getCachedTrip } from "@/lib/offline/db";
import { useOfflineQueue } from "@/lib/offline/useOfflineQueue";
import { useRealtimeConnection } from "@/lib/realtime/useRealtimeConnection";
import { CalendarIcon, SparkleIcon, UsersIcon } from "@/components/icons";
import { Skeleton } from "@/components/Skeleton";
import { ErrorState } from "@/components/ErrorState";
import type { ItineraryMapStop } from "@/components/ItineraryMap";

const ItineraryMap = dynamic(() => import("@/components/ItineraryMap").then((m) => m.ItineraryMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-foreground/50">Loading map…</div>,
});

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const REASON_CODE_LABELS: Record<string, string> = {
  interest_match: "Matches your interests",
  accessibility_grounded: "Accessibility-grounded pick",
  safety_priority: "Weighed for safety",
  ai_recommended: "AI recommended",
  adaptation_proposed: "Added from an accepted trip update",
};

const TIME_OF_DAY_LABELS: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

const ADAPTATION_REASON_LABELS: Record<string, string> = {
  CROWD_THRESHOLD: "Crowd levels increased significantly near an upcoming stop on your trip.",
  INCIDENT_IMPACT: "A new incident was reported near an upcoming stop on your trip.",
};

const QUICK_REPLAN_ACTIONS: { value: QuickReplanAction; label: string }[] = [
  { value: "cheaper", label: "Make it cheaper" },
  { value: "more_relaxed", label: "More relaxed" },
  { value: "more_heritage", label: "More heritage" },
  { value: "more_food", label: "More food" },
  { value: "less_walking", label: "Less walking" },
  { value: "avoid_crowds", label: "Avoid crowds" },
  { value: "improve_safety", label: "Improve safety" },
];

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["ACCOMMODATION", "FOOD", "TRANSPORT", "SHOPPING", "ACTIVITIES", "OTHER"];

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ base64, mediaType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AddExpenseForm({ tripId, onAdded }: { tripId: string; onAdded: (e: Expense) => void }) {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<ExpenseCategory>("OTHER");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onScanReceipt(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setScanning(true);
    setError(null);
    setScanNote(null);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      const result = await api.scanReceipt({ image_base64: base64, media_type: mediaType }, token);
      if (result.no_receipt_detected) {
        setScanNote("That didn't look like a receipt — fill in the details manually below.");
      } else {
        setAmount(String(result.amount));
        setCategory(result.category_guess);
        setDescription(result.vendor || description);
        setScanNote(
          `Scanned: ${result.vendor || "unknown vendor"}, ${result.currency} ${result.amount}${
            result.date_text ? ` (${result.date_text})` : ""
          } — review before saving.`
        );
      }
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not scan this receipt.");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const expense = await api.createExpense(
        { trip_id: tripId, category, amount: parsed, description: description || undefined, incurred_at: new Date().toISOString() },
        token
      );
      onAdded(expense);
      setAmount("");
      setDescription("");
      setScanNote(null);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not add this expense.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Add an expense</h2>
        <label className="cursor-pointer text-sm font-medium text-primary">
          {scanning ? "Scanning…" : "Scan a receipt"}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onScanReceipt} disabled={scanning} className="hidden" />
        </label>
      </div>
      {scanNote && <p className="text-sm text-foreground/60">{scanNote}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
          step="0.01"
          required
          placeholder="Amount (INR)"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What was it for? (optional)"
        maxLength={500}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add expense"}
      </button>
    </form>
  );
}

// How often the continuous-sharing toggle below pushes a fresh fix — same
// interval as web/src/app/location-sharing/page.tsx's own ping loop, kept
// consistent across the app's two "keep sending my location" features.
const CONTINUOUS_SHARE_INTERVAL_MS = 15000;

function GroupSection({ trip }: { trip: Trip }) {
  const { token, me } = useAuth();
  const [members, setMembers] = useState<TripMember[]>([]);
  const [safety, setSafety] = useState<GroupSafety | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [continuousSharing, setContinuousSharing] = useState(false);

  function refresh() {
    if (!token) return;
    api.listTripMembers(trip.id, token).then(setMembers).catch(() => {});
    api.getGroupSafety(trip.id, token).then(setSafety).catch(() => setSafety(null));
  }

  useEffect(refresh, [token, trip.id]);

  // Progressive enhancement: when any member's location updates (a real
  // WS broadcast from POST /group-travel/trips/{id}/location, added
  // alongside the existing endpoint, never replacing it), refresh the
  // safety score shown below immediately instead of waiting for this
  // component's next full reload — no new map UI is added here since
  // none existed to enhance.
  const { subscribe: subscribeGroupLocation } = useRealtimeConnection(token ? { token } : null);
  useEffect(() => {
    return subscribeGroupLocation(`location:group:${trip.id}`, () => {
      if (!token) return;
      api.getGroupSafety(trip.id, token).then(setSafety).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, token]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!token || !inviteEmail) return;
    setError(null);
    setBusy(true);
    try {
      await api.inviteTripMember(trip.id, inviteEmail, token);
      setInviteEmail("");
      refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not invite this person.");
    } finally {
      setBusy(false);
    }
  }

  async function onAccept(memberId: string) {
    if (!token) return;
    await api.acceptTripInvite(memberId, token);
    refresh();
  }

  function shareMyLocation() {
    if (!token || !navigator.geolocation) return;
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await api.updateMyTripLocation(
            trip.id,
            { lon: position.coords.longitude, lat: position.coords.latitude },
            token
          );
          setStatus("Location shared with the group.");
          refresh();
        } catch (err) {
          setStatus(isApiError(err) ? err.message : "Could not share your location.");
        }
      },
      () => setStatus("Location access was denied.")
    );
  }

  const myMember = members.find((m) => m.user_id === me?.id);
  const isOwner = trip.user_id === me?.id;
  const iAmActiveMember = myMember?.status === "ACTIVE";

  function toggleContinuousSharing() {
    if (!continuousSharing && !navigator.geolocation) {
      setStatus("Location access isn't available in this browser.");
      return;
    }
    setContinuousSharing((v) => !v);
  }

  // Additive, optional upgrade to the one-shot button above: repeats the
  // exact same existing update call on an interval instead of once. Zero
  // backend change — still the pre-existing /group-travel/trips/{id}/location
  // endpoint — and shareMyLocation()'s own one-shot behavior is untouched.
  // Stops itself if the member becomes inactive, same as the one-shot
  // button's own visibility guard. Every setState call below happens inside
  // an async geolocation callback, never synchronously in the effect body
  // itself (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!continuousSharing || !token || !iAmActiveMember) return;

    function pushOnce() {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            await api.updateMyTripLocation(
              trip.id,
              { lon: position.coords.longitude, lat: position.coords.latitude },
              token!
            );
            setStatus(`Sharing continuously — last update ${new Date().toLocaleTimeString()}.`);
            refresh();
          } catch (err) {
            setStatus(isApiError(err) ? err.message : "Could not share your location.");
          }
        },
        () => {
          setStatus("Location access was denied.");
          setContinuousSharing(false);
        }
      );
    }

    pushOnce();
    const interval = setInterval(pushOnce, CONTINUOUS_SHARE_INTERVAL_MS);
    return () => clearInterval(interval);
    // refresh isn't memoized and would otherwise restart this interval on
    // every unrelated re-render — same justified exception as this file's
    // own `useEffect(refresh, [token, trip.id])` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuousSharing, token, iAmActiveMember, trip.id]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-1.5 text-lg font-semibold">
        <UsersIcon width={18} height={18} />
        Group
      </h2>

      {members.length > 0 && (
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
              <span>
                {m.role === "OWNER" ? "Trip owner" : "Member"}
                {safety?.by_member[m.user_id] != null && (
                  <span className="ml-2 text-foreground/55">safety {Math.round(safety.by_member[m.user_id]! * 100)}%</span>
                )}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                m.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-surface-muted text-foreground/60"
              }`}>
                {m.status}
              </span>
              {m.status === "INVITED" && m.user_id === me?.id && (
                <button onClick={() => onAccept(m.id)} className="text-sm font-medium text-primary">
                  Accept
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {safety && safety.average_safety_score != null && (
        <p className="text-sm text-foreground/60">
          Group safety score: {Math.round(safety.average_safety_score * 100)}% ({safety.members_covered}/{safety.members_total} members covered)
        </p>
      )}

      {iAmActiveMember && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={shareMyLocation} className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">
            Share my location with the group
          </button>
          <button
            onClick={toggleContinuousSharing}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
              continuousSharing ? "border-success/40 bg-success/10 text-success" : "border-border hover:bg-surface-muted"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${continuousSharing ? "animate-pulse bg-success" : "bg-foreground/30"}`}
              aria-hidden
            />
            {continuousSharing ? "Sharing continuously — tap to stop" : "Share continuously"}
          </button>
        </div>
      )}
      {continuousSharing && (
        <p className="text-xs text-foreground/55">
          Updates every {CONTINUOUS_SHARE_INTERVAL_MS / 1000}s while this page stays open — there&apos;s no background
          app in this build, so closing the tab pauses it.
        </p>
      )}
      {status && <p className="text-sm text-foreground/60">{status}</p>}

      {isOwner && (
        <form onSubmit={onInvite} className="flex gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            type="email"
            required
            placeholder="Invite by email"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "Inviting…" : "Invite"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function ExpensesSection({ trip }: { trip: Trip }) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<TripFinancialSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  function refresh() {
    if (!token) return;
    api.getTripFinancialSummary(trip.id, token).then(setSummary).catch(() => {});
    api.listExpenses(token, trip.id).then(setExpenses).catch(() => {});
  }

  useEffect(refresh, [token, trip.id]);

  async function onDelete(id: string) {
    if (!token) return;
    await api.deleteExpense(id, token);
    refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Expenses</h2>
      {summary && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-foreground/55">Spent so far</span>
            <span className="text-2xl font-semibold tracking-tight">
              {summary.currency} {summary.total_spent.toFixed(2)}
            </span>
          </div>
          {summary.budget != null && (
            <>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={`h-full rounded-full transition-all ${summary.is_over_budget ? "bg-danger" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (summary.total_spent / summary.budget) * 100)}%` }}
                />
              </div>
              <p className={`mt-2 text-sm ${summary.is_over_budget ? "text-danger" : "text-foreground/60"}`}>
                {summary.is_over_budget
                  ? `Over budget by ${summary.currency} ${Math.abs(summary.remaining ?? 0).toFixed(2)}`
                  : `${summary.currency} ${summary.remaining?.toFixed(2)} left of a ${summary.budget} budget`}
              </p>
            </>
          )}
        </div>
      )}

      <AddExpenseForm tripId={trip.id} onAdded={refresh} />

      {expenses.length > 0 && (
        <ul className="flex flex-col gap-2">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
              <div>
                <span className="font-medium">
                  {e.currency} {e.amount}
                </span>
                <span className="ml-2 text-foreground/55">{e.category}</span>
                {e.description && <span className="ml-2 text-foreground/55">— {e.description}</span>}
              </div>
              <button onClick={() => onDelete(e.id)} className="text-foreground/55 hover:text-danger">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItineraryItemRow({
  item,
  tripId,
  itineraryId,
  onUpdated,
}: {
  item: ItineraryItem;
  tripId: string;
  itineraryId: string;
  onUpdated: (item: ItineraryItem) => void;
}) {
  const { token } = useAuth();
  const { online, enqueueItineraryItem } = useOfflineQueue();
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function applyUpdate(patch: { note?: string; completed?: boolean }) {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    const baseVersion = item.item_version;
    try {
      if (!online) {
        await enqueueItineraryItem({ item_id: item.id, base_item_version: baseVersion, ...patch });
        onUpdated({ ...item, ...patch });
        setMessage("Saved on this device — will sync once you're back online.");
        return;
      }
      try {
        const updated = await api.updateItineraryItem(
          tripId,
          itineraryId,
          item.id,
          { base_item_version: baseVersion, ...patch },
          token
        );
        onUpdated(updated);
      } catch (err) {
        if (err instanceof NetworkError) {
          await enqueueItineraryItem({ item_id: item.id, base_item_version: baseVersion, ...patch });
          onUpdated({ ...item, ...patch });
          setMessage("Saved on this device — will sync once you're back online.");
        } else if (isApiError(err) && (err.code === "ITEM_VERSION_CONFLICT" || err.code === "ITINERARY_SUPERSEDED")) {
          setMessage("This was changed elsewhere — your edit didn't apply. Refresh to see the latest.");
        } else {
          setMessage(isApiError(err) ? err.message : "Could not save this change.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function saveNote() {
    setEditingNote(false);
    if (noteDraft !== (item.note ?? "")) applyUpdate({ note: noteDraft });
  }

  return (
    <li className="relative">
      <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => applyUpdate({ completed: !item.completed })}
              disabled={busy}
              aria-label={item.completed ? "Mark as not done" : "Mark as done"}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition ${
                item.completed ? "border-success bg-success text-white" : "border-border text-transparent"
              }`}
            >
              ✓
            </button>
            <span className={`font-medium ${item.completed ? "text-foreground/55 line-through" : ""}`}>
              {item.attraction_name ?? "Unnamed stop"}
            </span>
          </div>
          {item.scheduled_time ? (
            <span className="whitespace-nowrap text-xs text-foreground/50">
              {new Date(item.scheduled_time).toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          ) : item.time_of_day ? (
            <span className="whitespace-nowrap text-xs text-foreground/50">
              {TIME_OF_DAY_LABELS[item.time_of_day] ?? item.time_of_day}
            </span>
          ) : null}
        </div>
        {item.explanation && <p className="mt-1.5 text-foreground/70">{item.explanation}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.reason_code && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground/60">
              {REASON_CODE_LABELS[item.reason_code] ?? item.reason_code}
            </span>
          )}
          {item.nearest_accessible_facility_m != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              ♿ {Math.round(item.nearest_accessible_facility_m)}m to nearest verified accessible facility
            </span>
          )}
        </div>
        {editingNote ? (
          <div className="mt-2 flex gap-2">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={saveNote}
              onKeyDown={(e) => e.key === "Enter" && saveNote()}
              autoFocus
              placeholder="Add a note…"
              className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        ) : (
          <button
            onClick={() => setEditingNote(true)}
            className="mt-2 text-xs text-foreground/55 underline decoration-dotted hover:text-foreground/70"
          >
            {item.note || "Add a note"}
          </button>
        )}
        {message && <p className="mt-1.5 text-xs text-primary">{message}</p>}
      </div>
    </li>
  );
}

function AdaptationBanner({
  trip,
  itinerary,
  onApplied,
}: {
  trip: Trip;
  itinerary: Itinerary;
  onApplied: (itinerary: Itinerary) => void;
}) {
  const { token } = useAuth();
  const [proposals, setProposals] = useState<AdaptationProposal[]>([]);
  const [checking, setChecking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!token) return;
    api.listTripAdaptations(trip.id, token).then(setProposals).catch(() => {});
  }

  useEffect(refresh, [token, trip.id]);

  // Progressive enhancement, same pattern as GroupSection's `location:group`
  // subscription above: a real WS push from the adaptation engine
  // (backend/app/domains/adaptation/service.py's `process_event`) refreshes
  // this list immediately, but the "Check for trip updates" button below
  // still works with zero real-time infra if the socket is down.
  const { subscribe } = useRealtimeConnection(token ? { token } : null);
  useEffect(() => {
    return subscribe(`adaptation:trip:${trip.id}`, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, token]);

  async function onCheck() {
    if (!token) return;
    setChecking(true);
    setError(null);
    try {
      await api.checkTripAdaptations(trip.id, token);
      refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not check for updates.");
    } finally {
      setChecking(false);
    }
  }

  async function onAccept(proposalId: string) {
    if (!token) return;
    setBusyId(proposalId);
    setError(null);
    try {
      await api.acceptAdaptationProposal(proposalId, token);
      onApplied(await api.getTripItinerary(trip.id, token));
      refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not accept this suggestion.");
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(proposalId: string) {
    if (!token) return;
    setBusyId(proposalId);
    setError(null);
    try {
      await api.rejectAdaptationProposal(proposalId, token);
      refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not dismiss this suggestion.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = proposals.filter((p) => p.status === "PROPOSED");

  return (
    <div className="flex flex-col gap-3">
      {pending.map((p) => {
        const added = new Set(p.changes.added_attraction_ids);
        const removed = new Set(p.changes.removed_attraction_ids);
        const addedItems = p.changes.proposed_items.filter((i) => added.has(i.attraction_id));
        const removedItems = itinerary.items.filter((i) => i.attraction_id && removed.has(i.attraction_id));
        const keptCount = p.changes.kept_attraction_ids.length;
        return (
          <div key={p.id} className="rounded-card border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-primary">Change detected</h2>
              <span className="whitespace-nowrap rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary">
                {p.risk_level} impact
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground/70">
              {ADAPTATION_REASON_LABELS[p.reason_code] ?? p.reason_code}
            </p>
            <p className="mt-2 text-sm text-foreground/80">{p.changes.summary}</p>
            {(removedItems.length > 0 || addedItems.length > 0 || keptCount > 0) && (
              <div className="mt-3 flex flex-col gap-1.5">
                {removedItems.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 rounded-control bg-danger/5 px-2.5 py-1.5 text-xs">
                    <span className="shrink-0 rounded-pill bg-danger/15 px-1.5 py-0.5 font-semibold uppercase text-danger">
                      Removed
                    </span>
                    <span className="text-foreground/70 line-through">{i.attraction_name ?? "Unnamed stop"}</span>
                  </div>
                ))}
                {addedItems.map((i) => (
                  <div
                    key={i.attraction_id}
                    className="flex flex-col gap-0.5 rounded-control bg-success/5 px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-pill bg-success/15 px-1.5 py-0.5 font-semibold uppercase text-success">
                        Added
                      </span>
                      <span className="font-medium text-foreground/85">{i.attraction_name ?? "Unnamed stop"}</span>
                    </div>
                    {i.reason && <p className="pl-1 text-foreground/55">{i.reason}</p>}
                  </div>
                ))}
                {keptCount > 0 && (
                  <p className="px-1 text-xs text-foreground/50">
                    {keptCount} other stop{keptCount > 1 ? "s" : ""} unchanged
                  </p>
                )}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onAccept(p.id)}
                disabled={busyId === p.id}
                className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busyId === p.id ? "Applying…" : "Accept"}
              </button>
              <button
                onClick={() => onReject(p.id)}
                disabled={busyId === p.id}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
              >
                Keep current plan
              </button>
            </div>
          </div>
        );
      })}
      <button
        onClick={onCheck}
        disabled={checking}
        className="self-start text-xs font-medium text-foreground/50 underline decoration-dotted hover:text-foreground/80 disabled:opacity-50"
      >
        {checking ? "Checking…" : "Check for trip updates"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Groups items into real calendar/day buckets regardless of which shape
 * this itinerary's data has (scheduled_time for a dated trip, day_offset
 * for a duration-only one) — one day-tab model for both, instead of two
 * separate rendering branches. */
function groupItineraryByDay(items: ItineraryItem[]): { label: string; items: ItineraryItem[] }[] {
  const hasScheduledTimes = items.some((i) => i.scheduled_time);
  const groups = new Map<number, { label: string; sortKey: number; items: ItineraryItem[] }>();
  for (const item of items) {
    let key: number;
    let label: string;
    let sortKey: number;
    if (hasScheduledTimes && item.scheduled_time) {
      const date = new Date(item.scheduled_time);
      key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      label = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      sortKey = key;
    } else {
      key = item.day_offset ?? 0;
      label = `Day ${key + 1}`;
      sortKey = key;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.items.push(item);
    else groups.set(key, { label, sortKey, items: [item] });
  }
  return [...groups.values()].sort((a, b) => a.sortKey - b.sortKey).map(({ label, items }) => ({ label, items }));
}

function ItineraryView({
  trip,
  itinerary,
  onItemUpdated,
}: {
  trip: Trip;
  itinerary: Itinerary;
  onItemUpdated: (item: ItineraryItem) => void;
}) {
  const [activeDay, setActiveDay] = useState(0);
  const [attractionLocations, setAttractionLocations] = useState<Map<string, Attraction>>(new Map());

  const days = useMemo(() => groupItineraryByDay(itinerary.items), [itinerary.items]);
  const clampedActiveDay = Math.min(activeDay, Math.max(days.length - 1, 0));

  useEffect(() => {
    if (!itinerary.destination_id) return;
    api
      .listAttractions(itinerary.destination_id)
      .then((attractions) => setAttractionLocations(new Map(attractions.map((a) => [a.id, a]))))
      .catch(() => setAttractionLocations(new Map()));
  }, [itinerary.destination_id]);

  const activeDayItems = days[clampedActiveDay]?.items ?? [];
  const mapStops: ItineraryMapStop[] = activeDayItems
    .filter((item): item is ItineraryItem & { attraction_id: string } => item.attraction_id != null && attractionLocations.has(item.attraction_id))
    .map((item, idx) => ({
      id: item.id,
      location: attractionLocations.get(item.attraction_id)!.location,
      sequence: idx + 1,
      name: item.attraction_name ?? "Unnamed stop",
      timeLabel: item.scheduled_time
        ? new Date(item.scheduled_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : item.time_of_day
          ? TIME_OF_DAY_LABELS[item.time_of_day] ?? item.time_of_day
          : null,
      completed: item.completed,
    }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-foreground/60">
        <span>Version {itinerary.version}</span>
        <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Generated by {itinerary.generated_by}
        </span>
      </div>

      {itinerary.replan_reason && (
        <p className="rounded-card border border-border bg-surface-muted px-3 py-2 text-xs text-foreground/60">
          Replanned{itinerary.previous_version != null ? ` from v${itinerary.previous_version}` : ""} because:{" "}
          {itinerary.replan_reason}
        </p>
      )}

      {itinerary.unmatched_avoid_terms.length > 0 && (
        <p className="rounded-card border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          No real data to exclude for: {itinerary.unmatched_avoid_terms.join(", ")}
        </p>
      )}

      {days.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Trip days">
          {days.map((d, idx) => (
            <button
              key={idx}
              role="tab"
              aria-selected={idx === clampedActiveDay}
              onClick={() => setActiveDay(idx)}
              className={`shrink-0 rounded-pill px-3 py-1.5 text-xs font-medium transition ${
                idx === clampedActiveDay
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-foreground/60 hover:bg-surface-muted"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      <ol className="relative flex flex-col gap-3 border-l border-border pl-5">
        {activeDayItems.map((item) => (
          <ItineraryItemRow
            key={item.id}
            item={item}
            tripId={trip.id}
            itineraryId={itinerary.id}
            onUpdated={onItemUpdated}
          />
        ))}
      </ol>

      {mapStops.length > 0 && (
        <div className="h-64 overflow-hidden rounded-card border border-border">
          <ItineraryMap stops={mapStops} />
        </div>
      )}

      <div className="rounded-card border border-border bg-surface-muted px-3 py-2 text-xs text-foreground/60">
        {itinerary.cost_estimate_available && itinerary.total_cost != null
          ? `Estimated cost: ${itinerary.currency} ${itinerary.total_cost}`
          : "Cost estimates aren't available for this itinerary — no attraction has real price data yet."}
      </div>
    </div>
  );
}

function GenerateItineraryForm({
  tripId,
  destinations,
  onGenerated,
}: {
  tripId: string;
  destinations: Destination[];
  onGenerated: (it: Itinerary) => void;
}) {
  const { token } = useAuth();
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !destinationId) return;
    setError(null);
    setSubmitting(true);
    try {
      const itinerary = await api.generateItinerary({ trip_id: tripId, destination_id: destinationId, prompt }, token);
      onGenerated(itinerary);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not generate an itinerary.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <SparkleIcon width={16} height={16} className="text-primary" />
        Generate an itinerary with AI
      </h2>
      <select
        value={destinationId}
        onChange={(e) => setDestinationId(e.target.value)}
        required
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        required
        rows={2}
        placeholder="What are you looking for?"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Planning…" : "Generate itinerary"}
      </button>
    </form>
  );
}

function ReplanForm({ itineraryId, onReplanned }: { itineraryId: string; onReplanned: (it: Itinerary) => void }) {
  const { token } = useAuth();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitReplan(reasonText: string, quickAction?: QuickReplanAction) {
    if (!token || !reasonText.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const itinerary = await api.replanItinerary(itineraryId, { reason: reasonText, quick_action: quickAction }, token);
      onReplanned(itinerary);
      setReason("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not replan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await submitReplan(reason);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-muted p-5">
      <h2 className="text-sm font-medium">Not quite right? Replan it</h2>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_REPLAN_ACTIONS.map((qa) => (
          <button
            key={qa.value}
            type="button"
            disabled={submitting}
            onClick={() => submitReplan(qa.label, qa.value)}
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium hover:bg-surface-muted disabled:opacity-50"
          >
            {qa.label}
          </button>
        ))}
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. It's raining, prefer indoor sights"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !reason.trim()}
        className="self-start rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
      >
        {submitting ? "Replanning…" : "Replan"}
      </button>
    </form>
  );
}

function CarbonFootprintCard({ tripId }: { tripId: string }) {
  const { token } = useAuth();
  const [footprint, setFootprint] = useState<CarbonFootprint | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getTripCarbonFootprint(tripId, token).then(setFootprint).catch(() => setFootprint(null));
  }, [token, tripId]);

  if (!footprint || footprint.stops_counted < 2) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
      <div className="font-medium">Estimated carbon footprint</div>
      <p className="mt-1 text-foreground/70">
        ~{footprint.total_distance_km} km between stops · ~{footprint.estimated_kg_co2} kg CO₂
      </p>
      <p className="mt-1 text-xs text-foreground/55">
        A rough distance-based estimate, not a certified calculation — actual footprint depends on transport mode.
      </p>
    </div>
  );
}

function RestaurantsPanel({ destinationId }: { destinationId: string }) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);

  useEffect(() => {
    api
      .listBusinesses({ destination_id: destinationId, category: "RESTAURANT" })
      .then(setBusinesses)
      .catch(() => setBusinesses([]));
  }, [destinationId]);

  if (businesses === null) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">Where to eat</h2>
      <p className="mt-0.5 text-xs text-foreground/50">
        Real, separately verified businesses near this destination — not part of the AI-planned itinerary above.
      </p>
      {businesses.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/60">No listed restaurants for this destination yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {businesses.slice(0, 5).map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
            >
              <Link href={`/businesses/${b.id}`} className="font-medium hover:text-primary">
                {b.name}
              </Link>
              {b.is_verified && <span className="text-xs font-medium text-success">Verified</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TripDetail() {
  const { token } = useAuth();
  const params = useParams<{ id: string }>();
  const tripId = params.id;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !tripId) return;
    const authToken = token;
    let cancelled = false;

    async function load() {
      try {
        const [t, it, dests] = await Promise.all([
          api.getTrip(tripId, authToken),
          api.getTripItinerary(tripId, authToken).catch((err) => {
            if (isApiError(err) && err.status === 404) return null;
            throw err;
          }),
          api.listDestinations(),
        ]);
        if (cancelled) return;
        setTrip(t);
        setItinerary(it);
        setDestinations(dests);
        setStaleSince(null);
        void cacheTrip(tripId, t);
        if (it) void cacheItinerary(tripId, it);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof NetworkError) {
          const [cachedTrip, cachedItinerary] = await Promise.all([
            getCachedTrip<Trip>(tripId),
            getCachedItinerary<Itinerary>(tripId),
          ]);
          if (cancelled) return;
          if (cachedTrip) {
            setTrip(cachedTrip.data);
            setItinerary(cachedItinerary?.data ?? null);
            setStaleSince(cachedTrip.cached_at);
          } else {
            setError("You're offline, and this trip hasn't been saved on this device yet.");
          }
        } else {
          setError("Could not load this trip.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token, tripId]);

  function onItemUpdated(updated: ItineraryItem) {
    setItinerary((prev) => (prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev));
  }

  async function togglePublic() {
    if (!token || !trip) return;
    const updated = await api.updateTrip(trip.id, { is_public: !trip.is_public }, token);
    setTrip(updated);
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading trip…</span>
        <div className="flex items-start gap-3">
          <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/3" />
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }
  if (error || !trip) {
    return (
      <div className="mx-auto max-w-lg">
        <ErrorState
          title={error ?? "Trip not found."}
          description={error ? "Your other trips are still available." : undefined}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      {staleSince && (
        <p className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground/60">
          Showing data saved {formatRelativeTime(staleSince)} — you&apos;re offline, so this may not reflect the
          latest changes.
        </p>
      )}
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarIcon width={20} height={20} />
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{trip.title ?? "Untitled trip"}</h1>
            <div className="flex items-center gap-2">
              <Link
                href={`/trips/${trip.id}/chat`}
                className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-surface-muted"
              >
                Trip chat
              </Link>
              <button
                onClick={togglePublic}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                  trip.is_public ? "bg-success/10 text-success" : "bg-surface-muted text-foreground/60"
                }`}
              >
                {trip.is_public ? "Public journal" : "Make public"}
              </button>
            </div>
          </div>
          <p className="text-sm text-foreground/60">
            {trip.status}
            {trip.budget != null && ` · Budget: ${trip.currency} ${trip.budget}`}
          </p>
        </div>
      </div>

      {itinerary ? (
        <>
          <AdaptationBanner trip={trip} itinerary={itinerary} onApplied={setItinerary} />
          <ItineraryView trip={trip} itinerary={itinerary} onItemUpdated={onItemUpdated} />
          <ReplanForm itineraryId={itinerary.id} onReplanned={setItinerary} />
          <CarbonFootprintCard tripId={trip.id} />
          {itinerary.destination_id && <RestaurantsPanel destinationId={itinerary.destination_id} />}
        </>
      ) : (
        <GenerateItineraryForm tripId={trip.id} destinations={destinations} onGenerated={setItinerary} />
      )}

      <GroupSection trip={trip} />
      <ExpensesSection trip={trip} />
    </div>
  );
}

export default function TripDetailPage() {
  return (
    <RequireAuth>
      <TripDetail />
    </RequireAuth>
  );
}
