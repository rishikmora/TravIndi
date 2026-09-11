"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  TRANSPORT_CATEGORIES,
  type Availability,
  type Booking,
  type Business,
  type BusinessCategory,
  type Destination,
  type DietaryOption,
  type PriceRange,
  type Review,
  type Service,
  type Verification,
} from "@/lib/api";
import { QrTicket } from "@/components/QrTicket";
import { BuildingIcon, CalendarIcon, ImageIcon, MinusIcon, PlusIcon, StarIcon, TicketIcon } from "@/components/icons";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

const DIETARY_OPTIONS: DietaryOption[] = ["VEGETARIAN", "VEGAN", "JAIN", "HALAL", "GLUTEN_FREE", "NON_VEGETARIAN"];
const DIETARY_LABELS: Record<DietaryOption, string> = {
  VEGETARIAN: "Vegetarian",
  VEGAN: "Vegan",
  JAIN: "Jain",
  HALAL: "Halal",
  GLUTEN_FREE: "Gluten-free",
  NON_VEGETARIAN: "Non-vegetarian",
};
const PRICE_RANGES: PriceRange[] = ["BUDGET", "MODERATE", "PREMIUM"];
const PRICE_LABELS: Record<PriceRange, string> = { BUDGET: "₹ Budget", MODERATE: "₹₹ Moderate", PREMIUM: "₹₹₹ Premium" };

function FoodProfileSection({ business, onUpdated }: { business: Business; onUpdated: (b: Business) => void }) {
  const { token } = useAuth();
  const [cuisinesText, setCuisinesText] = useState(business.profile?.cuisines.join(", ") ?? "");
  const [dietary, setDietary] = useState<Set<DietaryOption>>(new Set(business.profile?.dietary_options ?? []));
  const [priceRange, setPriceRange] = useState<PriceRange | "">(business.profile?.price_range ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleDietary(option: DietaryOption) {
    setDietary((prev) => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.upsertBusinessProfile(
        business.id,
        {
          description: business.profile?.description ?? undefined,
          image_url: business.profile?.image_url ?? null,
          cuisines: cuisinesText
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
          dietary_options: Array.from(dietary),
          price_range: priceRange || null,
          // The upsert endpoint replaces the whole profile, not a partial
          // patch — carry through fields this form doesn't own so saving
          // food info can't silently wipe a saved accessibility profile
          // (or the business photo).
          accessibility_features: business.profile?.accessibility_features ?? {},
        },
        token
      );
      onUpdated(updated);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not update the food profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
      <h3 className="font-medium">Cuisine & dietary options</h3>
      <label className="flex flex-col gap-1">
        Cuisines (comma-separated)
        <input
          value={cuisinesText}
          onChange={(e) => setCuisinesText(e.target.value)}
          placeholder="e.g. North Indian, Street food, Chaat"
          className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {DIETARY_OPTIONS.map((d) => (
          <label
            key={d}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
              dietary.has(d) ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground/60"
            }`}
          >
            <input type="checkbox" className="hidden" checked={dietary.has(d)} onChange={() => toggleDietary(d)} />
            {DIETARY_LABELS[d]}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        Price range
        <select
          value={priceRange}
          onChange={(e) => setPriceRange(e.target.value as PriceRange | "")}
          className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Not set</option>
          {PRICE_RANGES.map((p) => (
            <option key={p} value={p}>
              {PRICE_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function PhotoSection({ business, onUpdated }: { business: Business; onUpdated: (b: Business) => void }) {
  const { token } = useAuth();
  const [imageUrl, setImageUrl] = useState(business.profile?.image_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const updated = await api.upsertBusinessProfile(
        business.id,
        {
          description: business.profile?.description ?? undefined,
          image_url: imageUrl.trim() || null,
          // Same reasoning as FoodProfileSection/AccessibilityProfileSection
          // — the upsert replaces the whole profile, so carry through
          // everything this form doesn't own.
          cuisines: business.profile?.cuisines ?? [],
          dietary_options: business.profile?.dietary_options ?? [],
          price_range: business.profile?.price_range ?? null,
          accessibility_features: business.profile?.accessibility_features ?? {},
        },
        token
      );
      onUpdated(updated);
      setSaved(true);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not update the photo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
      <h3 className="flex items-center gap-1.5 font-medium">
        <ImageIcon width={15} height={15} className="text-foreground/50" />
        Photo
      </h3>
      <p className="text-xs text-foreground/55">
        Paste a link to a real photo of your business (no file upload is wired up yet — host the
        image anywhere and link to it here).
      </p>
      <input
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder="https://…"
        className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {error && <p className="text-danger">{error}</p>}
      {saved && !error && <p className="text-success">Saved.</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

const ACCESSIBILITY_FLAGS: { key: string; label: string }[] = [
  { key: "wheelchair_accessible", label: "Wheelchair accessible" },
  { key: "step_free_access", label: "Step-free access" },
  { key: "accessible_parking", label: "Accessible parking" },
];

function AccessibilityProfileSection({ business, onUpdated }: { business: Business; onUpdated: (b: Business) => void }) {
  const { token } = useAuth();
  const initial = (business.profile?.accessibility_features ?? {}) as Record<string, unknown>;
  const [flags, setFlags] = useState<Set<string>>(
    new Set(ACCESSIBILITY_FLAGS.map((f) => f.key).filter((k) => initial[k] === true))
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggle(key: string) {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const accessibility_features: Record<string, boolean> = {};
      for (const f of ACCESSIBILITY_FLAGS) accessibility_features[f.key] = flags.has(f.key);
      const updated = await api.upsertBusinessProfile(
        business.id,
        {
          description: business.profile?.description ?? undefined,
          image_url: business.profile?.image_url ?? null,
          // Same reasoning as FoodProfileSection: carry through fields this
          // form doesn't own so this save can't wipe the food profile
          // (or the business photo).
          cuisines: business.profile?.cuisines ?? [],
          dietary_options: business.profile?.dietary_options ?? [],
          price_range: business.profile?.price_range ?? null,
          accessibility_features,
        },
        token
      );
      onUpdated(updated);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not update the accessibility profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
      <h3 className="font-medium">Accessibility</h3>
      <p className="text-xs text-foreground/55">
        Self-declared, like the rest of this directory — no inspection data source exists, so
        only what you state here is ever shown to travelers with accessibility needs.
      </p>
      <div className="flex flex-wrap gap-2">
        {ACCESSIBILITY_FLAGS.map((f) => (
          <label
            key={f.key}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
              flags.has(f.key) ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/60"
            }`}
          >
            <input type="checkbox" className="hidden" checked={flags.has(f.key)} onChange={() => toggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
      {error && <p className="text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

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

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground/70 disabled:opacity-30"
        aria-label="Decrease party size"
      >
        <MinusIcon width={13} height={13} />
      </button>
      <span className="w-5 text-center text-sm font-semibold">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground/70 disabled:opacity-30"
        aria-label="Increase party size"
      >
        <PlusIcon width={13} height={13} />
      </button>
    </div>
  );
}

function SlotBookingRow({ service, slot, onBooked }: { service: Service; slot: Availability; onBooked: (b: Booking) => void }) {
  const { token } = useAuth();
  const remaining = slot.capacity - slot.booked_count;
  const [expanded, setExpanded] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = service.base_price != null ? service.base_price * partySize : null;

  async function onConfirm() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const booking = await api.createBooking(
        { service_id: service.id, availability_id: slot.id, party_size: partySize, notes: notes || undefined },
        token
      );
      onBooked(booking);
      setExpanded(false);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not book this slot.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-3 py-2 text-xs">
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
            · {remaining}/{slot.capacity} open
          </span>
        </span>
        {token ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            disabled={remaining <= 0}
            className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {remaining <= 0 ? "Full" : expanded ? "Cancel" : "Book"}
          </button>
        ) : (
          <span className="text-foreground/55">Sign in to book</span>
        )}
      </div>
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border bg-surface-muted/60 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground/70">Party size</span>
            <Stepper value={partySize} min={1} max={remaining} onChange={setPartySize} />
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-foreground/70">Notes (optional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. arriving by taxi, need a wheelchair-accessible table"
              className="rounded-lg border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-foreground/60">
              {total != null ? (
                <>
                  Total: <span className="font-semibold text-foreground">{service.currency} {total}</span>
                </>
              ) : (
                "No listed price — confirmed on arrival"
              )}
            </span>
            <button
              onClick={onConfirm}
              disabled={submitting}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </div>
          {error && <p className="text-danger">{error}</p>}
        </div>
      )}
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
  const [slots, setSlots] = useState<Availability[] | null>(null);

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
        {slots === null && <p className="text-xs text-foreground/50">Loading availability…</p>}
        {slots?.length === 0 && <EmptyState title="No time slots open yet." />}
        {slots?.map((slot) =>
          isOwner ? (
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
            </div>
          ) : (
            <SlotBookingRow
              key={slot.id}
              service={service}
              slot={slot}
              onBooked={(b) => {
                refresh();
                onBooked(b);
              }}
            />
          )
        )}
      </div>
    </li>
  );
}

function AddServiceForm({
  businessId,
  category,
  destinations,
  onAdded,
}: {
  businessId: string;
  category: BusinessCategory;
  destinations: Destination[];
  onAdded: (s: Service) => void;
}) {
  const { token } = useAuth();
  const isTransport = TRANSPORT_CATEGORIES.includes(category);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
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
        {
          name,
          description: description || undefined,
          base_price: basePrice ? Number(basePrice) : undefined,
          origin_destination_id: isTransport && originId ? originId : undefined,
          destination_destination_id: isTransport && destinationId ? destinationId : undefined,
        },
        token
      );
      onAdded(service);
      setName("");
      setDescription("");
      setBasePrice("");
      setOriginId("");
      setDestinationId("");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not add this service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted p-4 text-sm">
      <h3 className="font-medium">{isTransport ? "Add a route" : "Add a bookable service"}</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder={isTransport ? "e.g. Delhi → Agra" : "e.g. Deluxe Room, City Tour, Table for two"}
        className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {isTransport && (
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={originId}
            onChange={(e) => setOriginId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Origin destination</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Arrival destination</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
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
        {submitting ? "Adding…" : isTransport ? "Add route" : "Add service"}
      </button>
    </form>
  );
}

function ServicesSection({ business, isOwner }: { business: Business; isOwner: boolean }) {
  const { token } = useAuth();
  const [services, setServices] = useState<Service[] | null>(null);
  const [justBooked, setJustBooked] = useState<Booking | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const isTransport = TRANSPORT_CATEGORIES.includes(business.category);

  useEffect(() => {
    api.listServices(business.id).then(setServices);
  }, [business.id]);

  useEffect(() => {
    if (!isOwner || !isTransport) return;
    api.listDestinations().then(setDestinations).catch(() => setDestinations([]));
  }, [isOwner, isTransport]);

  return (
    <div className="flex flex-col gap-3">
      {isOwner && (
        <AddServiceForm
          businessId={business.id}
          category={business.category}
          destinations={destinations}
          onAdded={(s) => setServices((prev) => [...(prev ?? []), s])}
        />
      )}
      {justBooked && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-5 text-center">
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <TicketIcon width={16} height={16} />
            Booked! Here&apos;s your ticket.
          </p>
          {justBooked.total_amount != null && (
            <p className="text-xs text-foreground/60">
              Party of {justBooked.party_size} · {justBooked.currency} {justBooked.total_amount}
            </p>
          )}
          {justBooked.ticket && <QrTicket token={justBooked.ticket.qr_token} />}
          <p className="text-xs text-foreground/60">
            Show this at check-in — no payment gateway is wired up in this prototype, so the booking is confirmed
            immediately.{" "}
            <Link href="/bookings" className="font-medium text-primary underline">
              View all your bookings
            </Link>
          </p>
        </div>
      )}
      {services === null && <Skeleton className="h-16 w-full" />}
      {services?.length === 0 && <EmptyState title="No services listed yet." />}
      {services && services.length > 0 && (
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
          {bookings.length === 0 && <EmptyState title="No bookings yet." />}
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
        {reviews.length === 0 && <EmptyState title="No reviews yet." />}
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

  if (!isOwner || business.is_verified) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      {verification ? (
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
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    api
      .getBusiness(businessId)
      .then(setBusiness)
      .catch(() => setError("Business not found."));
  }, [businessId]);

  useEffect(() => {
    if (!business?.destination_id) return;
    api.getDestination(business.destination_id).then((d) => setDestinationName(d.name)).catch(() => {});
  }, [business?.destination_id]);

  if (error) {
    return (
      <ErrorState title={error} onRetry={() => window.location.reload()} />
    );
  }
  if (!business) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading business…</span>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const isOwner = me?.id === business.owner_user_id;

  return (
    <div className="flex flex-col gap-8">
      {business.profile?.image_url && (
        <div className="washed relative -mx-4 h-56 overflow-hidden rounded-b-3xl sm:mx-0 sm:h-72 sm:rounded-3xl">
          {/* A plain img element, not next/image — see PhotoSection's comment. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={business.profile.image_url}
            alt={business.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-start">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BuildingIcon width={26} height={26} />
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
            {business.is_verified && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Verified</span>
            )}
            {business.is_eco_certified && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">Eco-certified</span>
            )}
            {business.profile?.accessibility_features?.wheelchair_accessible === true && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">♿ Accessible</span>
            )}
          </div>
          <p className="text-sm text-foreground/60">
            {business.category}
            {destinationName ? ` · ${destinationName}` : ""}
          </p>
          {business.profile?.description && <p className="mt-2 text-sm">{business.profile.description}</p>}
          {business.profile &&
            (business.profile.cuisines.length > 0 || business.profile.dietary_options.length > 0 || business.profile.price_range) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {business.profile.cuisines.map((c) => (
                  <span key={c} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-foreground/70">
                    {c}
                  </span>
                ))}
                {business.profile.price_range && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {PRICE_LABELS[business.profile.price_range]}
                  </span>
                )}
                {business.profile.dietary_options.map((d) => (
                  <span key={d} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    {DIETARY_LABELS[d]}
                  </span>
                ))}
              </div>
            )}
        </div>
      </div>

      <VerificationSection business={business} />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="mb-2 text-lg font-medium">Services & booking</h2>
          <ServicesSection business={business} isOwner={isOwner} />
        </section>

        <div className="flex flex-col gap-6">
          {isOwner && <PhotoSection business={business} onUpdated={setBusiness} />}
          {isOwner && (business.category === "RESTAURANT" ? <FoodProfileSection business={business} onUpdated={setBusiness} /> : null)}
          {isOwner && <AccessibilityProfileSection business={business} onUpdated={setBusiness} />}
          {isOwner && <OwnerBookingsPanel businessId={business.id} />}
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-medium">Reviews</h2>
        <ReviewsSection businessId={business.id} />
      </section>
    </div>
  );
}
