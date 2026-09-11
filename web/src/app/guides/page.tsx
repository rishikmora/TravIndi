"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Destination, type Guide } from "@/lib/api";
import { ArrowRightIcon, LanguageIcon, UsersIcon } from "@/components/icons";

function RegisterGuideForm({ onCreated }: { onCreated: (g: Guide) => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [languages, setLanguages] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const guide = await api.createGuide(
        {
          languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
          specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean),
          bio: bio || undefined,
        },
        token
      );
      onCreated(guide);
      setOpen(false);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not register your guide profile.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-full border border-dashed border-border px-4 py-2 text-sm font-medium text-foreground/70 hover:border-accent hover:text-accent"
      >
        + Register as a guide
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">Register as a guide</h2>
      <input
        value={languages}
        onChange={(e) => setLanguages(e.target.value)}
        autoFocus
        placeholder="Languages (comma-separated, e.g. Hindi, English)"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <input
        value={specialties}
        onChange={(e) => setSpecialties(e.target.value)}
        placeholder="Specialties (comma-separated, e.g. Heritage, Food)"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={2}
        placeholder="Short bio (optional)"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Registering…" : "Register"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-foreground/50 hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}

function GuideCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-surface p-5">
      <div className="h-9 w-9 rounded-lg bg-surface-muted" />
      <div className="mt-4 h-4 w-2/3 rounded bg-surface-muted" />
      <div className="mt-2 h-3 w-1/2 rounded bg-surface-muted" />
    </div>
  );
}

function GuideCard({ guide, destinationName }: { guide: Guide; destinationName?: string }) {
  return (
    <Link
      href={`/guides/${guide.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <UsersIcon width={18} height={18} />
        </span>
        <ArrowRightIcon
          width={14}
          height={14}
          className="mt-1 text-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium leading-tight">{guide.specialties[0] ?? "Local guide"}</span>
          {guide.is_verified && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Verified</span>
          )}
        </div>
        {destinationName && <p className="mt-0.5 text-xs text-foreground/55">{destinationName}</p>}
      </div>
      {guide.languages.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-foreground/60">
          <LanguageIcon width={13} height={13} className="text-foreground/40" />
          {guide.languages.join(", ")}
        </p>
      )}
      {guide.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {guide.specialties.map((s) => (
            <span key={s} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-foreground/60">
              {s}
            </span>
          ))}
        </div>
      )}
      {guide.bio && <p className="line-clamp-2 text-xs text-foreground/60">{guide.bio}</p>}
    </Link>
  );
}

export default function GuidesPage() {
  const { token, me } = useAuth();
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  function refresh() {
    api
      .listGuides({ destination_id: destinationId || undefined, verified_only: verifiedOnly || undefined })
      .then(setGuides)
      .catch(() => setError("Could not load guides."));
  }

  useEffect(() => {
    api.listDestinations().then(setDestinations).catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationId, verifiedOnly]);

  const destinationName = useMemo(() => {
    const map = new Map(destinations.map((d) => [d.id, d.name]));
    return (id: string | null) => (id ? map.get(id) : undefined);
  }, [destinations]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Local guides</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {guides ? `${guides.length} guides` : "Loading…"} — registered directly on TravIndi, verified through the
            same KYC workflow as businesses.
          </p>
        </div>
        {token && me?.account_type === "guide" && (
          <RegisterGuideForm onCreated={(g) => setGuides((prev) => (prev ? [g, ...prev] : [g]))} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-muted p-3">
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
        <label className="flex items-center gap-1.5 text-sm text-foreground/70">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Verified only
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {guides === null && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <GuideCardSkeleton key={i} />
          ))}
        </div>
      )}

      {guides !== null && guides.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {guides.map((g, i) => (
            <div key={g.id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
              <GuideCard guide={g} destinationName={destinationName(g.destination_id)} />
            </div>
          ))}
        </div>
      )}

      {guides !== null && guides.length === 0 && !error && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <UsersIcon width={28} height={28} className="text-foreground/30" />
          <p className="text-sm text-foreground/60">No guides match these filters.</p>
        </div>
      )}
    </div>
  );
}
