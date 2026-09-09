"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Destination, type Guide, type Review, type Verification } from "@/lib/api";
import { LanguageIcon, StarIcon, UsersIcon } from "@/components/icons";

function EditGuideForm({ guide, onUpdated }: { guide: Guide; onUpdated: (g: Guide) => void }) {
  const { token } = useAuth();
  const [languages, setLanguages] = useState(guide.languages.join(", "));
  const [specialties, setSpecialties] = useState(guide.specialties.join(", "));
  const [bio, setBio] = useState(guide.bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.updateGuide(
        guide.id,
        {
          languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
          specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean),
          destination_id: guide.destination_id ?? undefined,
          bio: bio || undefined,
        },
        token
      );
      onUpdated(updated);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not update your guide profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
      <h3 className="font-medium">Edit your profile</h3>
      <label className="flex flex-col gap-1">
        Languages (comma-separated)
        <input
          value={languages}
          onChange={(e) => setLanguages(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      <label className="flex flex-col gap-1">
        Specialties (comma-separated)
        <input
          value={specialties}
          onChange={(e) => setSpecialties(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      <label className="flex flex-col gap-1">
        Bio
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
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

function VerificationSection({ guide, onVerified }: { guide: Guide; onVerified: () => void }) {
  const { token, me } = useAuth();
  const [verification, setVerification] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOwner = me?.id === guide.user_id;

  async function onSubmit() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const v = await api.submitVerification({ subject_type: "GUIDE", subject_id: guide.id }, token);
      setVerification(v);
      onVerified();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not submit for verification.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOwner || guide.is_verified) return null;

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

function ReviewsSection({ guideId }: { guideId: string }) {
  const { token } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    if (!token) return;
    api.listReviews("GUIDE", guideId, token).then(setReviews);
  }

  useEffect(refresh, [token, guideId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.createReview({ target_type: "GUIDE", target_id: guideId, rating, body: body || undefined }, token);
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

export default function GuideDetailPage() {
  const { me } = useAuth();
  const params = useParams<{ id: string }>();
  const guideId = params.id;
  const [guide, setGuide] = useState<Guide | null>(null);
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!guideId) return;
    api
      .getGuide(guideId)
      .then(setGuide)
      .catch(() => setError("Guide not found."));
  }, [guideId]);

  useEffect(() => {
    if (!guide?.destination_id) return;
    api
      .getDestination(guide.destination_id)
      .then((d: Destination) => setDestinationName(d.name))
      .catch(() => {});
  }, [guide?.destination_id]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!guide) return <p className="text-sm text-foreground/60">Loading…</p>;

  const isOwner = me?.id === guide.user_id;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-start">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <UsersIcon width={26} height={26} />
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{guide.specialties[0] ?? "Local guide"}</h1>
            {guide.is_verified && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Verified</span>
            )}
          </div>
          {destinationName && <p className="text-sm text-foreground/60">{destinationName}</p>}
          {guide.languages.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground/70">
              <LanguageIcon width={14} height={14} className="text-foreground/40" />
              {guide.languages.join(", ")}
            </p>
          )}
          {guide.specialties.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {guide.specialties.map((s) => (
                <span key={s} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-foreground/70">
                  {s}
                </span>
              ))}
            </div>
          )}
          {guide.bio && <p className="mt-3 text-sm text-foreground/80">{guide.bio}</p>}
        </div>
      </div>

      <VerificationSection guide={guide} onVerified={() => {}} />
      {isOwner && <EditGuideForm guide={guide} onUpdated={setGuide} />}

      <section>
        <h2 className="mb-2 text-lg font-medium">Reviews</h2>
        <ReviewsSection guideId={guide.id} />
      </section>
    </div>
  );
}
