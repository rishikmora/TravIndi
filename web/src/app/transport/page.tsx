"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type BusinessCategory, type Destination, type TransportSearchResult } from "@/lib/api";
import { QrTicket } from "@/components/QrTicket";
import { ArrowRightIcon, BuildingIcon, CalendarIcon } from "@/components/icons";
import { CardGridSkeleton } from "@/components/Skeleton";

const MODES: { value: BusinessCategory; label: string }[] = [
  { value: "AIRLINE", label: "Flights" },
  { value: "RAILWAY", label: "Trains" },
  { value: "BUS_OPERATOR", label: "Buses" },
];

function formatDeparture(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function durationLabel(startsAt: string, endsAt: string): string {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground/70 disabled:opacity-30"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-semibold">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground/70 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function DepartureCard({ result }: { result: TransportSearchResult }) {
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);

  const total = result.base_price != null ? result.base_price * partySize : null;

  async function onConfirm() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await api.createBooking(
        { service_id: result.service_id, availability_id: result.availability_id, party_size: partySize, notes: notes || undefined },
        token
      );
      setQrToken(booking.ticket?.qr_token ?? null);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not complete this booking.");
    } finally {
      setBusy(false);
    }
  }

  if (qrToken) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-5 text-center">
        <p className="text-sm font-medium text-success">Booked — {partySize} seat{partySize > 1 ? "s" : ""} on {result.business_name}</p>
        <QrTicket token={qrToken} />
        <p className="text-xs text-foreground/55">
          Show this at check-in — no payment gateway is wired up in this prototype, so the booking is confirmed immediately.
        </p>
        <Link href="/bookings" className="text-xs font-medium text-primary hover:underline">
          View in My bookings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/businesses/${result.business_id}`} className="text-sm font-semibold hover:text-primary">
            {result.business_name}
          </Link>
          <p className="mt-0.5 text-xs text-foreground/55">
            {result.origin_name ?? "Unknown origin"} → {result.destination_name ?? "Unknown destination"}
          </p>
        </div>
        {result.base_price != null && (
          <span className="whitespace-nowrap text-lg font-semibold text-primary">
            {result.currency} {result.base_price.toLocaleString()}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-foreground/70">
          <CalendarIcon width={14} height={14} className="text-foreground/40" />
          {formatDeparture(result.starts_at)}
        </span>
        <span className="text-foreground/55">{durationLabel(result.starts_at, result.ends_at)}</span>
        <span className={result.remaining > 0 ? "text-success" : "text-danger"}>
          {result.remaining > 0 ? `${result.remaining} seats left` : "Full"}
        </span>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Seats</span>
            <Stepper value={partySize} min={1} max={Math.max(1, result.remaining)} onChange={setPartySize} />
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {total != null && (
            <p className="text-sm text-foreground/70">
              Total: <span className="font-semibold">{result.currency} {total.toLocaleString()}</span>
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              disabled={busy || !token}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Booking…" : "Confirm booking"}
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted"
            >
              Cancel
            </button>
          </div>
          {!token && <p className="text-xs text-foreground/55">Sign in to book a seat.</p>}
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          disabled={result.remaining <= 0}
          className="self-start rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-40"
        >
          {result.remaining <= 0 ? "Full" : "Select seats"}
        </button>
      )}
    </div>
  );
}

function TransportSearchPage() {
  const [mode, setMode] = useState<BusinessCategory>("AIRLINE");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [results, setResults] = useState<TransportSearchResult[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listDestinations().then(setDestinations).catch(() => setDestinations([]));
  }, []);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const data = await api.searchTransport({
        category: mode,
        origin_destination_id: originId || undefined,
        destination_destination_id: destinationId || undefined,
      });
      setResults(data);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not search right now.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BuildingIcon width={22} height={22} className="text-primary" />
          Flights, trains &amp; buses
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          Real routes and scheduled departures, seeded by real operators in this prototype — no live GDS/IRCTC
          integration exists, so these are demo schedules, but every booking, seat count, and QR ticket below is
          genuinely real and independently verifiable at check-in.
        </p>
      </div>

      <form onSubmit={onSearch} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex gap-1.5 rounded-full bg-surface-muted p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                mode === m.value ? "bg-primary text-primary-foreground" : "text-foreground/60 hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={originId}
            onChange={(e) => setOriginId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Any origin</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.city ? ` (${d.city})` : ""}
              </option>
            ))}
          </select>
          <select
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Any destination</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.city ? ` (${d.city})` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="self-start rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
          {!loading && <ArrowRightIcon width={14} height={14} className="ml-1.5 inline" />}
        </button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loading && <CardGridSkeleton count={3} className="sm:grid-cols-1 lg:grid-cols-1" />}

      {!loading && searched && results !== null && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
          <CalendarIcon width={28} height={28} className="text-foreground/30" />
          <p className="text-sm text-foreground/60">
            No {MODES.find((m) => m.value === mode)?.label.toLowerCase()} match this search. Try clearing the
            origin/destination filters — this prototype only has a handful of real seeded routes.
          </p>
        </div>
      )}

      {!loading && results && results.length > 0 && (
        <div className="flex flex-col gap-3">
          {results.map((r) => (
            <DepartureCard key={r.availability_id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TransportPage() {
  return <TransportSearchPage />;
}
