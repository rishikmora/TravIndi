"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  type Trip,
  type Itinerary,
  type Destination,
  type Expense,
  type ExpenseCategory,
  type TripFinancialSummary,
  type TripMember,
  type GroupSafety,
  type CarbonFootprint,
} from "@/lib/api";
import { CalendarIcon, SparkleIcon, UsersIcon } from "@/components/icons";

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

function GroupSection({ trip }: { trip: Trip }) {
  const { token, me } = useAuth();
  const [members, setMembers] = useState<TripMember[]>([]);
  const [safety, setSafety] = useState<GroupSafety | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    if (!token) return;
    api.listTripMembers(trip.id, token).then(setMembers).catch(() => {});
    api.getGroupSafety(trip.id, token).then(setSafety).catch(() => setSafety(null));
  }

  useEffect(refresh, [token, trip.id]);

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
                  <span className="ml-2 text-foreground/45">safety {Math.round(safety.by_member[m.user_id]! * 100)}%</span>
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

      {(myMember?.status === "ACTIVE") && (
        <button onClick={shareMyLocation} className="self-start rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">
          Share my location with the group
        </button>
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
                {e.description && <span className="ml-2 text-foreground/45">— {e.description}</span>}
              </div>
              <button onClick={() => onDelete(e.id)} className="text-foreground/40 hover:text-danger">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-foreground/60">
        <span>Version {itinerary.version}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Generated by {itinerary.generated_by}
        </span>
      </div>
      <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
        {itinerary.items.map((item) => (
          <li key={item.id} className="relative">
            <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.attraction_name ?? "Unnamed stop"}</span>
                {item.scheduled_time && (
                  <span className="whitespace-nowrap text-xs text-foreground/50">
                    {new Date(item.scheduled_time).toLocaleString(undefined, {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
              {item.explanation && <p className="mt-1.5 text-foreground/70">{item.explanation}</p>}
              {item.nearest_accessible_facility_m != null && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  ♿ {Math.round(item.nearest_accessible_facility_m)}m to nearest verified accessible facility
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const itinerary = await api.replanItinerary(itineraryId, { reason }, token);
      onReplanned(itinerary);
      setReason("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not replan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-muted p-5">
      <h2 className="text-sm font-medium">Not quite right? Replan it</h2>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
        placeholder="e.g. It's raining, prefer indoor sights"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
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
      <p className="mt-1 text-xs text-foreground/45">
        A rough distance-based estimate, not a certified calculation — actual footprint depends on transport mode.
      </p>
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

  useEffect(() => {
    if (!token || !tripId) return;
    Promise.all([
      api.getTrip(tripId, token),
      api.getTripItinerary(tripId, token).catch((err) => {
        if (isApiError(err) && err.status === 404) return null;
        throw err;
      }),
      api.listDestinations(),
    ])
      .then(([t, it, dests]) => {
        setTrip(t);
        setItinerary(it);
        setDestinations(dests);
      })
      .catch(() => setError("Could not load this trip."))
      .finally(() => setLoading(false));
  }, [token, tripId]);

  async function togglePublic() {
    if (!token || !trip) return;
    const updated = await api.updateTrip(trip.id, { is_public: !trip.is_public }, token);
    setTrip(updated);
  }

  if (loading) return <p className="text-sm text-foreground/60">Loading…</p>;
  if (error || !trip) return <p className="text-sm text-danger">{error ?? "Trip not found."}</p>;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarIcon width={20} height={20} />
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{trip.title ?? "Untitled trip"}</h1>
            <button
              onClick={togglePublic}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                trip.is_public ? "bg-success/10 text-success" : "bg-surface-muted text-foreground/60"
              }`}
            >
              {trip.is_public ? "Public journal" : "Make public"}
            </button>
          </div>
          <p className="text-sm text-foreground/60">
            {trip.status}
            {trip.budget != null && ` · Budget: ${trip.currency} ${trip.budget}`}
          </p>
        </div>
      </div>

      {itinerary ? (
        <>
          <ItineraryView itinerary={itinerary} />
          <ReplanForm itineraryId={itinerary.id} onReplanned={setItinerary} />
          <CarbonFootprintCard tripId={trip.id} />
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
