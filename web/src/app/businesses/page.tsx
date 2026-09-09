"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Business, type BusinessCategory, type Destination, type DietaryOption } from "@/lib/api";
import { ArrowRightIcon, BuildingIcon, SearchIcon } from "@/components/icons";

const CATEGORIES: BusinessCategory[] = ["HOTEL", "RESTAURANT", "TAXI", "ARTISAN", "TOUR_OPERATOR", "OTHER"];
const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  HOTEL: "Hotels",
  RESTAURANT: "Restaurants",
  TAXI: "Taxis",
  ARTISAN: "Artisans",
  TOUR_OPERATOR: "Tour operators",
  OTHER: "Other",
};
const DIETARY_OPTIONS: DietaryOption[] = ["VEGETARIAN", "VEGAN", "JAIN", "HALAL", "GLUTEN_FREE", "NON_VEGETARIAN"];
const DIETARY_LABELS: Record<DietaryOption, string> = {
  VEGETARIAN: "Vegetarian",
  VEGAN: "Vegan",
  JAIN: "Jain",
  HALAL: "Halal",
  GLUTEN_FREE: "Gluten-free",
  NON_VEGETARIAN: "Non-vegetarian",
};
const PRICE_LABELS: Record<string, string> = { BUDGET: "₹", MODERATE: "₹₹", PREMIUM: "₹₹₹" };

function RegisterBusinessForm({ onCreated }: { onCreated: (b: Business) => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BusinessCategory>("HOTEL");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const business = await api.createBusiness({ name, category }, token);
      onCreated(business);
      setName("");
      setOpen(false);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not register this business.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-full border border-dashed border-border px-4 py-2 text-sm font-medium text-foreground/70 hover:border-primary hover:text-primary"
      >
        + Register your business
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-5">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-foreground/60">Business name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          placeholder="e.g. Ganga View Homestay"
          className="w-56 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-foreground/60">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as BusinessCategory)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={submitting || !name}
        className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Registering…" : "Register"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-foreground/50 hover:text-foreground">
        Cancel
      </button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}

function BusinessCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-surface p-5">
      <div className="h-9 w-9 rounded-lg bg-surface-muted" />
      <div className="mt-4 h-4 w-2/3 rounded bg-surface-muted" />
      <div className="mt-2 h-3 w-1/3 rounded bg-surface-muted" />
      <div className="mt-4 flex gap-1.5">
        <div className="h-5 w-16 rounded-full bg-surface-muted" />
        <div className="h-5 w-14 rounded-full bg-surface-muted" />
      </div>
    </div>
  );
}

function BusinessCard({ business, destinationName }: { business: Business; destinationName?: string }) {
  const b = business;
  return (
    <Link
      href={`/businesses/${b.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BuildingIcon width={18} height={18} />
        </span>
        <ArrowRightIcon
          width={14}
          height={14}
          className="mt-1 text-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </div>
      <div>
        <div className="font-medium leading-tight">{b.name}</div>
        <div className="mt-0.5 text-xs text-foreground/55">
          {CATEGORY_LABELS[b.category]}
          {destinationName ? ` · ${destinationName}` : ""}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {b.is_verified && (
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Verified</span>
        )}
        {b.is_eco_certified && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">Eco-certified</span>
        )}
        {b.profile?.accessibility_features?.wheelchair_accessible === true && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">♿ Accessible</span>
        )}
        {b.profile?.price_range && (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-foreground/70">
            {PRICE_LABELS[b.profile.price_range]}
          </span>
        )}
      </div>

      {b.profile && (b.profile.cuisines.length > 0 || b.profile.dietary_options.length > 0) && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/70 pt-3">
          {b.profile.cuisines.slice(0, 3).map((c) => (
            <span key={c} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-foreground/60">
              {c}
            </span>
          ))}
          {b.profile.dietary_options.slice(0, 2).map((d) => (
            <span key={d} className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
              {DIETARY_LABELS[d]}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export default function BusinessesPage() {
  const { token, me } = useAuth();
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<BusinessCategory | "">("");
  const [destinationId, setDestinationId] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [dietaryFilter, setDietaryFilter] = useState<DietaryOption | "">("");
  const [accessibleOnly, setAccessibleOnly] = useState(false);

  function refresh(overrides?: Partial<{ dietaryFilter: DietaryOption | ""; accessibleOnly: boolean }>) {
    api
      .listBusinesses({
        category: category || undefined,
        destination_id: destinationId || undefined,
        verified_only: verifiedOnly || undefined,
        dietary_option: (overrides?.dietaryFilter ?? dietaryFilter) || undefined,
        accessible_only: overrides?.accessibleOnly ?? accessibleOnly,
      })
      .then(setBusinesses)
      .catch(() => setError("Could not load businesses."));
  }

  useEffect(() => {
    api.listDestinations().then(setDestinations).catch(() => {});
  }, []);

  // Re-fetches (without resetting to the loading state) whenever a filter
  // changes — swaps in fresh results, no skeleton flicker on every click.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, destinationId, verifiedOnly]);

  // Disability-aware default: a tourist with a saved WHEELCHAIR need sees
  // "Accessible only" pre-checked here too, not just in the AI planner.
  useEffect(() => {
    if (!token) return;
    api
      .getTravelPreferences(token)
      .then((prefs) => {
        if (prefs.accessibility_needs.includes("WHEELCHAIR")) {
          setAccessibleOnly(true);
          refresh({ accessibleOnly: true });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const destinationName = useMemo(() => {
    const map = new Map(destinations.map((d) => [d.id, d.name]));
    return (id: string | null) => (id ? map.get(id) : undefined);
  }, [destinations]);

  const filtered = (businesses ?? []).filter((b) =>
    q ? b.name.toLowerCase().includes(q.toLowerCase()) : true
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Business directory</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {businesses ? `${businesses.length} real, self-owned listings` : "Loading…"} — hotels, restaurants, taxis,
            tour operators, and artisans, KYC-verified through a real workflow.
          </p>
        </div>
        {token && me?.account_type === "business" && (
          <RegisterBusinessForm onCreated={(b) => setBusinesses((prev) => (prev ? [b, ...prev] : [b]))} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-muted p-3">
        <div className="relative">
          <SearchIcon width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name"
            className="w-48 rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as BusinessCategory | "")}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All destinations</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={dietaryFilter}
          onChange={(e) => {
            const v = e.target.value as DietaryOption | "";
            setDietaryFilter(v);
            refresh({ dietaryFilter: v });
          }}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Any diet</option>
          {DIETARY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {DIETARY_LABELS[d]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-foreground/70">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Verified only
        </label>
        <label className="flex items-center gap-1.5 text-sm text-foreground/70">
          <input
            type="checkbox"
            checked={accessibleOnly}
            onChange={(e) => {
              setAccessibleOnly(e.target.checked);
              refresh({ accessibleOnly: e.target.checked });
            }}
            className="h-4 w-4 accent-primary"
          />
          ♿ Accessible only
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {businesses === null && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <BusinessCardSkeleton key={i} />
          ))}
        </div>
      )}

      {businesses !== null && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((b) => (
            <BusinessCard key={b.id} business={b} destinationName={destinationName(b.destination_id)} />
          ))}
        </div>
      )}

      {businesses !== null && filtered.length === 0 && !error && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <BuildingIcon width={28} height={28} className="text-foreground/30" />
          <p className="text-sm text-foreground/60">No business matches these filters.</p>
        </div>
      )}
    </div>
  );
}
