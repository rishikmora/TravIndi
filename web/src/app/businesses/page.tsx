"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Business, type BusinessCategory } from "@/lib/api";
import { ArrowRightIcon, BuildingIcon } from "@/components/icons";

const CATEGORIES: BusinessCategory[] = ["HOTEL", "RESTAURANT", "TAXI", "ARTISAN", "TOUR_OPERATOR", "OTHER"];

function RegisterBusinessForm({ onCreated }: { onCreated: (b: Business) => void }) {
  const { token } = useAuth();
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
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not register this business.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">Register your business</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Business name"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as BusinessCategory)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !name}
        className="self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Registering…" : "Register"}
      </button>
    </form>
  );
}

export default function BusinessesPage() {
  const { token, me } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.listBusinesses().then(setBusinesses).catch(() => setError("Could not load businesses."));
  }

  useEffect(refresh, []);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business directory</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Hotels, restaurants, taxis, and artisans registered on TravIndi — self-owned
          directory data, no external vendor feed.
        </p>
      </div>

      {token && me?.account_type === "business" && (
        <RegisterBusinessForm
          onCreated={(b) => {
            setBusinesses((prev) => [b, ...prev]);
          }}
        />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="flex flex-col gap-2">
        {businesses.map((b) => (
          <li key={b.id}>
            <Link
              href={`/businesses/${b.id}`}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BuildingIcon width={16} height={16} />
              </span>
              <span className="flex-1">
                <span className="font-medium">{b.name}</span>
                <span className="ml-2 text-xs text-foreground/50">{b.category}</span>
              </span>
              {b.is_verified && (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Verified</span>
              )}
              <ArrowRightIcon width={14} height={14} className="text-foreground/30 transition group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
        {businesses.length === 0 && !error && (
          <p className="text-sm text-foreground/60">No businesses registered yet.</p>
        )}
      </ul>
    </div>
  );
}
