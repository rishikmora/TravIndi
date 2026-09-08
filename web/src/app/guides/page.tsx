"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Guide } from "@/lib/api";
import { UsersIcon } from "@/components/icons";

function RegisterGuideForm({ onCreated }: { onCreated: (g: Guide) => void }) {
  const { token } = useAuth();
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
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not register your guide profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">Register as a guide</h2>
      <input
        value={languages}
        onChange={(e) => setLanguages(e.target.value)}
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
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Registering…" : "Register"}
      </button>
    </form>
  );
}

function SubmitGuideVerification({ guideId, onSubmitted }: { guideId: string; onSubmitted: () => void }) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.submitVerification({ subject_type: "GUIDE", subject_id: guideId }, token);
      setSubmitted(true);
      onSubmitted();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not submit for verification.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) return <p className="mt-1 text-xs text-foreground/60">Submitted for verification.</p>;

  return (
    <div className="mt-1">
      {error && <p className="text-xs text-danger">{error}</p>}
      <button onClick={onSubmit} disabled={submitting} className="text-xs font-medium text-primary underline disabled:opacity-50">
        {submitting ? "Submitting…" : "Submit for verification"}
      </button>
    </div>
  );
}

export default function GuidesPage() {
  const { token, me } = useAuth();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listGuides().then(setGuides).catch(() => setError("Could not load guides."));
  }, []);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Local guides</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Guides registered directly on TravIndi, verified through the same
          business-verification workflow.
        </p>
      </div>

      {token && me?.account_type === "guide" && (
        <RegisterGuideForm onCreated={(g) => setGuides((prev) => [g, ...prev])} />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="flex flex-col gap-2">
        {guides.map((g) => (
          <li key={g.id} className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <UsersIcon width={16} height={16} />
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{g.languages.join(", ") || "Guide"}</span>
                {g.is_verified && (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Verified</span>
                )}
              </div>
              {g.specialties.length > 0 && <p className="mt-1 text-xs text-foreground/60">{g.specialties.join(", ")}</p>}
              {g.bio && <p className="mt-1 text-foreground/70">{g.bio}</p>}
              {token && me?.id === g.user_id && !g.is_verified && (
                <SubmitGuideVerification guideId={g.id} onSubmitted={() => {}} />
              )}
            </div>
          </li>
        ))}
        {guides.length === 0 && !error && <p className="text-sm text-foreground/60">No guides registered yet.</p>}
      </ul>
    </div>
  );
}
