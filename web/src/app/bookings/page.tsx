"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Booking } from "@/lib/api";
import { QrTicket } from "@/components/QrTicket";
import { TicketIcon } from "@/components/icons";

function statusTone(status: string) {
  if (status === "CONFIRMED") return "bg-success/10 text-success";
  if (status === "CANCELLED") return "bg-danger/10 text-danger";
  return "bg-surface-muted text-foreground/60";
}

function BookingCard({ booking, onCancelled }: { booking: Booking; onCancelled: (b: Booking) => void }) {
  const { token } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCancel() {
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await api.cancelBooking(booking.id, token);
      onCancelled(updated);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not cancel this booking.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{booking.service_name}</div>
          <div className="text-sm text-foreground/60">{booking.business_name}</div>
          <div className="mt-1 text-sm text-foreground/60">
            {new Date(booking.starts_at).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {" · "}Party of {booking.party_size}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${statusTone(booking.status)}`}>
          {booking.status}
        </span>
      </div>

      {booking.total_amount != null && (
        <p className="mt-2 text-sm text-foreground/70">
          {booking.currency} {booking.total_amount} <span className="text-xs text-foreground/45">(bookkeeping only — no real payment charged)</span>
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        {booking.ticket && (
          <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <TicketIcon width={15} height={15} />
            {expanded ? "Hide ticket" : "Show ticket"}
          </button>
        )}
        {booking.status === "CONFIRMED" && (
          <button onClick={onCancel} disabled={busy} className="text-sm text-danger disabled:opacity-50">
            {busy ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {expanded && booking.ticket && (
        <div className="mt-3 flex justify-center">
          <QrTicket token={booking.ticket.qr_token} />
        </div>
      )}
    </li>
  );
}

function BookingsList() {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .listBookings(token)
      .then(setBookings)
      .catch(() => setError("Could not load your bookings."));
  }, [token]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
        <p className="mt-1 text-sm text-foreground/60">Real time-slot bookings with a QR ticket for check-in.</p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {bookings === null && !error && <p className="text-sm text-foreground/60">Loading…</p>}
      {bookings?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <TicketIcon width={28} height={28} className="text-foreground/40" />
          <p className="text-sm text-foreground/60">No bookings yet.</p>
          <Link href="/businesses" className="text-sm font-medium text-primary">
            Browse businesses
          </Link>
        </div>
      )}
      {bookings && bookings.length > 0 && (
        <ul className="flex flex-col gap-3">
          {bookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              onCancelled={(updated) => setBookings((prev) => (prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <RequireAuth>
      <BookingsList />
    </RequireAuth>
  );
}
