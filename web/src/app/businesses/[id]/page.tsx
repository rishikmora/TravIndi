"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  type Availability,
  type Booking,
  type Business,
  type Review,
  type Service,
  type Verification,
} from "@/lib/api";
import { QrTicket } from "@/components/QrTicket";
import { CalendarIcon, StarIcon, TicketIcon } from "@/components/icons";

function AddAvailabilityForm({ serviceId, onAdded }: { serviceId: string; onAdded: (a: Availability) => void }) {
  const { token } = useAuth();
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !startsAt || !endsAt) return;
    setError(null);
    setSubmitting(true);
    try {
      const slot = await api.createAvailability(
        serviceId,
        { starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), capacity },
        token
      );
      onAdded(slot);
      setStartsAt("");
      setEndsAt("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not add this slot.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-muted p-3 text-xs">
      <label className="flex flex-col gap-1">
        Starts
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
          className="rounded border border-border bg-background px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        Ends
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          required
          className="rounded border border-border bg-background px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        Capacity
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
          className="w-16 rounded border border-border bg-background px-2 py-1"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add slot"}
      </button>
      {error && <p className="w-full text-danger">{error}</p>}
    </form>
  );
}

function BookSlotButton({ service, slot, onBooked }: { service: Service; slot: Availability; onBooked: (b: Booking) => void }) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const remaining = slot.capacity - slot.booked_count;

  async function onBook() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const booking = await api.createBooking({ service_id: service.id, availability_id: slot.id, party_size: 1 }, token);
      onBooked(booking);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not book this slot.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onBook}
        disabled={submitting || remaining <= 0 || !token}
        className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
      >
        {remaining <= 0 ? "Full" : submitting ? "Booking…" : "Book"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function ServiceCard({
  service,
  isOwner,
  onBooked,
}: {
  service: Service;
  isOwner: boolean;
  onBooked: (b: Booking) => void;
}) {
  const [slots, setSlots] = useState<Availability[]>([]);

  function refresh() {
    api.listAvailability(service.id).then(setSlots);
  }

  useEffect(refresh, [service.id]);

  return (
    <li className="rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{service.name}</span>
        {service.base_price != null && (
          <span className="text-xs text-foreground/60">
            {service.currency} {service.base_price}
          </span>
        )}
      </div>
      {service.description && <p className="mt-1 text-foreground/70">{service.description}</p>}

      {isOwner && <div className="mt-3">{<AddAvailabilityForm serviceId={service.id} onAdded={() => refresh()} />}</div>}

      <div className="mt-3 flex flex-col gap-1.5">
        {slots.length === 0 && <p className="text-xs text-foreground/50">No time slots open yet.</p>}
        {slots.map((slot) => (
          <div key={slot.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5">
              <CalendarIcon width={13} height={13} className="text-foreground/50" />
              {new Date(slot.starts_at).toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
                month: "short",
                day: "numeric",
              })}
              <span className="text-foreground/50">
                · {slot.capacity - slot.booked_count}/{slot.capacity} open
              </span>
            </span>
            {!isOwner && (
              <BookSlotButton
                service={service}
                slot={slot}
                onBooked={(b) => {
                  refresh();
                  onBooked(b);
                }}
              />
            )}
          </div>
        ))}
      </div>
    </li>
  );
}

function AddServiceForm({ businessId, onAdded }: { businessId: string; onAdded: (s: Service) => void }) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const service = await api.createService(
        businessId,
        { name, description: description || undefined, base_price: basePrice ? Number(basePrice) : undefined },
        token
      );
      onAdded(service);
      setName("");
      setDescription("");
      setBasePrice("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not add this service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted p-4 text-sm">
      <h3 className="font-medium">Add a bookable service</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="e.g. Deluxe Room, City Tour, Table for two"
        className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <input
        type="number"
        min={0}
        value={basePrice}
        onChange={(e) => setBasePrice(e.target.value)}
        placeholder="Price in INR (optional)"
        className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {error && <p className="text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="self-start rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add service"}
      </button>
    </form>
  );
}

function ServicesSection({ business, isOwner }: { business: Business; isOwner: boolean }) {
  const { token } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [justBooked, setJustBooked] = useState<Booking | null>(null);

  useEffect(() => {
    api.listServices(business.id).then(setServices);
  }, [business.id]);

  return (
    <div className="flex flex-col gap-3">
      {isOwner && <AddServiceForm businessId={business.id} onAdded={(s) => setServices((prev) => [...prev, s])} />}
      {justBooked && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-5 text-center">
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <TicketIcon width={16} height={16} />
            Booked! Here&apos;s your ticket.
          </p>
          {justBooked.ticket && <QrTicket token={justBooked.ticket.qr_token} />}
          <p className="text-xs text-foreground/60">Show this at check-in — no payment gateway is wired up in this prototype, so the booking is confirmed immediately.</p>
        </div>
      )}
      {services.length === 0 ? (
        <p className="text-sm text-foreground/60">No services listed yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} isOwner={isOwner} onBooked={setJustBooked} />
          ))}
        </ul>
      )}
      {!token && <p className="text-xs text-foreground/50">Log in to book a time slot.</p>}
    </div>
  );
}

function OwnerBookingsPanel({ businessId }: { businessId: string }) {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [qrInput, setQrInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!token) return;
    api.listBusinessBookings(businessId, token).then(setBookings);
  }

  useEffect(refresh, [token, businessId]);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!token || !qrInput.trim()) return;
    setError(null);
    try {
      const result = await api.verifyTicket(qrInput.trim(), token);
      setVerifyResult(result);
      setQrInput("");
      refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not verify this ticket.");
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-muted p-5">
      <h2 className="font-semibold">Check in a ticket</h2>
      <form onSubmit={onVerify} className="flex gap-2">
        <input
          value={qrInput}
          onChange={(e) => setQrInput(e.target.value)}
          placeholder="Paste the ticket's QR token"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Check in
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
      {verifyResult && (
        <p className="text-sm text-success">
          Checked in {verifyResult.service_name} for party of {verifyResult.party_size}.
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Recent bookings</h3>
        <ul className="flex flex-col gap-1.5">
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-xs">
              <span>
                {b.service_name} · party of {b.party_size}
              </span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium uppercase text-foreground/60">
                {b.status}
                {b.ticket && b.ticket.status !== "ISSUED" ? ` · ${b.ticket.status}` : ""}
              </span>
            </li>
          ))}
          {bookings.length === 0 && <p className="text-xs text-foreground/50">No bookings yet.</p>}
        </ul>
      </div>
    </div>
  );
}

function ReviewsSection({ businessId }: { businessId: string }) {
  const { token } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    if (!token) return;
    api.listReviews("BUSINESS", businessId, token).then(setReviews);
  }

  useEffect(refresh, [token, businessId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.createReview({ target_type: "BUSINESS", target_id: businessId, rating, body: body || undefined }, token);
      setBody("");
      refresh();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not post this review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {token && (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <label className="flex items-center gap-2 text-sm">
            Rating
            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Share your experience (optional)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="self-start rounded-full border border-border px-4 py-2 text-sm hover:bg-surface-muted disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post review"}
          </button>
        </form>
      )}
      <ul className="flex flex-col gap-2">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-0.5 text-primary">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <StarIcon key={i} width={13} height={13} />
                ))}
              </span>
              <span className="text-xs text-foreground/50">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            {r.body && <p className="mt-1 text-foreground/70">{r.body}</p>}
            {r.analysis && (
              <p className="mt-1 text-xs text-foreground/50">
                AI authenticity signal: {(r.analysis.authenticity_score ?? 0).toFixed(2)}
                {r.analysis.flags.length > 0 && ` · ${r.analysis.flags.join(", ")}`}
              </p>
            )}
          </li>
        ))}
        {reviews.length === 0 && <p className="text-sm text-foreground/60">No reviews yet.</p>}
      </ul>
    </div>
  );
}

function VerificationSection({ business }: { business: Business }) {
  const { token, me } = useAuth();
  const [verification, setVerification] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOwner = me?.id === business.owner_user_id;

  async function onSubmit() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const v = await api.submitVerification({ subject_type: "BUSINESS", subject_id: business.id }, token);
      setVerification(v);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not submit for verification.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOwner) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      {business.is_verified ? (
        <p className="font-medium text-success">This business is verified.</p>
      ) : verification ? (
        <p>
          Verification status: <span className="font-medium">{verification.status}</span>
          {verification.rejection_reason && ` — ${verification.rejection_reason}`}
        </p>
      ) : (
        <>
          <p className="mb-2 text-foreground/70">Not yet submitted for verification.</p>
          {error && <p className="mb-2 text-danger">{error}</p>}
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="rounded-full border border-border px-4 py-2 text-xs hover:bg-surface-muted disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit for verification"}
          </button>
        </>
      )}
    </div>
  );
}

export default function BusinessDetailPage() {
  const { me } = useAuth();
  const params = useParams<{ id: string }>();
  const businessId = params.id;
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    api
      .getBusiness(businessId)
      .then(setBusiness)
      .catch(() => setError("Business not found."));
  }, [businessId]);

  if (error) return <p className="mx-auto max-w-lg text-sm text-danger">{error}</p>;
  if (!business) return <p className="mx-auto max-w-lg text-sm text-foreground/60">Loading…</p>;

  const isOwner = me?.id === business.owner_user_id;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
          {business.is_verified && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Verified</span>
          )}
        </div>
        <p className="text-sm text-foreground/60">{business.category}</p>
        {business.profile?.description && <p className="mt-2 text-sm">{business.profile.description}</p>}
      </div>

      <VerificationSection business={business} />

      <section>
        <h2 className="mb-2 text-lg font-medium">Services & booking</h2>
        <ServicesSection business={business} isOwner={isOwner} />
      </section>

      {isOwner && <OwnerBookingsPanel businessId={business.id} />}

      <section>
        <h2 className="mb-2 text-lg font-medium">Reviews</h2>
        <ReviewsSection businessId={business.id} />
      </section>
    </div>
  );
}
