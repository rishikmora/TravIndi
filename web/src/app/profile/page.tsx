"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Business, type Guide, type MeGamification, type Review } from "@/lib/api";
import { ListSkeleton, Skeleton } from "@/components/Skeleton";
import {
  ArrowRightIcon,
  BellIcon,
  BuildingIcon,
  CalendarIcon,
  CompassIcon,
  LockIcon,
  LogoutIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldIcon,
  StarIcon,
  TicketIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";

const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "bn", label: "বাংলা (Bengali)" },
  { value: "ta", label: "தமிழ் (Tamil)" },
  { value: "te", label: "తెలుగు (Telugu)" },
  { value: "mr", label: "मराठी (Marathi)" },
  { value: "gu", label: "ગુજરાતી (Gujarati)" },
  { value: "kn", label: "ಕನ್ನಡ (Kannada)" },
];

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  tourist: "Tourist",
  guide: "Guide",
  business: "Business owner",
  authority: "Authority",
};

function initialsFrom(email: string | null, phone: string | null): string {
  const source = email ?? phone ?? "?";
  return source.slice(0, 2).toUpperCase();
}

function HubCard({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-primary/40 hover:bg-surface-muted"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-foreground/55">{detail}</div>
      </div>
      <ArrowRightIcon width={14} height={14} className="shrink-0 text-foreground/30" />
    </Link>
  );
}

function LanguageSection({ initialLanguage }: { initialLanguage: string | null }) {
  const { token, refreshMe } = useAuth();
  const [value, setValue] = useState(initialLanguage ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    if (!token) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.setLanguagePreference(value || null, token);
      await refreshMe();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-foreground/60">Preferred language</span>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-[12rem] rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Not set</option>
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {saved && <p className="text-xs text-success">Saved.</p>}
    </div>
  );
}

function PasswordSection() {
  const { token } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSuccess(false);
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next, token);
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(true);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not change your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-foreground/60">Current password</span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-foreground/60">New password</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-foreground/60">Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-success">Password changed.</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

function MyBusinessesSection() {
  const { token } = useAuth();
  const [businesses, setBusinesses] = useState<Business[] | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listMyBusinesses(token).then(setBusinesses).catch(() => setBusinesses([]));
  }, [token]);

  if (businesses === null) return <ListSkeleton count={2} />;

  if (businesses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-foreground/60">
        You haven&apos;t registered a business yet.{" "}
        <Link href="/businesses" className="font-medium text-primary hover:underline">
          Register one
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {businesses.map((b) => (
        <Link
          key={b.id}
          href={`/businesses/${b.id}`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BuildingIcon width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{b.name}</div>
            <div className="text-xs text-foreground/55">{b.category.replace(/_/g, " ").toLowerCase()}</div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              b.is_verified ? "bg-success/10 text-success" : "bg-surface-muted text-foreground/55"
            }`}
          >
            {b.is_verified ? "Verified" : "Pending verification"}
          </span>
          {b.is_eco_certified && (
            <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
              Eco-certified
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function MyGuideProfileSection() {
  const { token } = useAuth();
  const [guides, setGuides] = useState<Guide[] | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listMyGuides(token).then(setGuides).catch(() => setGuides([]));
  }, [token]);

  if (guides === null) return <ListSkeleton count={2} />;

  if (guides.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-foreground/60">
        You haven&apos;t set up your guide profile yet.{" "}
        <Link href="/guides" className="font-medium text-primary hover:underline">
          Set it up
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {guides.map((g) => (
        <Link
          key={g.id}
          href={`/guides/${g.id}`}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UsersIcon width={16} height={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{g.specialties[0] ?? "Guide profile"}</div>
            <div className="truncate text-xs text-foreground/55">
              {g.languages.length > 0 ? g.languages.join(", ") : "No languages listed"}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              g.is_verified ? "bg-success/10 text-success" : "bg-surface-muted text-foreground/55"
            }`}
          >
            {g.is_verified ? "Verified" : "Pending verification"}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ReviewRow({ review, targetName }: { review: Review; targetName: string | undefined }) {
  const href =
    review.target_type === "BUSINESS"
      ? `/businesses/${review.target_id}`
      : review.target_type === "GUIDE"
        ? `/guides/${review.target_id}`
        : review.target_type === "DESTINATION"
          ? `/destinations/${review.target_id}`
          : undefined;

  const label = targetName ?? `${review.target_type.charAt(0)}${review.target_type.slice(1).toLowerCase()}`;

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        {href ? (
          <Link href={href} className="flex items-center gap-1 text-sm font-medium hover:text-primary">
            {label}
            <ArrowRightIcon width={11} height={11} className="text-foreground/30" />
          </Link>
        ) : (
          <span className="text-sm font-medium">{label}</span>
        )}
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-foreground/70">
          {Array.from({ length: review.rating }).map((_, i) => (
            <StarIcon key={i} width={11} height={11} className="text-accent" />
          ))}
        </span>
      </div>
      {review.body && <p className="mt-1 text-sm text-foreground/60">{review.body}</p>}
      <p className="mt-1 text-xs text-foreground/55">{new Date(review.created_at).toLocaleDateString()}</p>
    </li>
  );
}

function MyReviewsSection() {
  const { token } = useAuth();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    api.listMyReviews(token).then(setReviews).catch(() => setReviews([]));
  }, [token]);

  useEffect(() => {
    if (!reviews) return;
    const missing = reviews.filter((r) => r.target_type !== "ATTRACTION" && !(r.target_id in names));
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (r) => {
        try {
          const name =
            r.target_type === "BUSINESS"
              ? (await api.getBusiness(r.target_id)).name
              : r.target_type === "GUIDE"
                ? (await api.getGuide(r.target_id)).specialties[0] ?? "Guide"
                : r.target_type === "DESTINATION"
                  ? (await api.getDestination(r.target_id)).name
                  : undefined;
          return [r.target_id, name] as const;
        } catch {
          return [r.target_id, undefined] as const;
        }
      })
    ).then((pairs) => {
      setNames((prev) => {
        const next = { ...prev };
        for (const [id, name] of pairs) if (name) next[id] = name;
        return next;
      });
    });
  }, [reviews, names]);

  if (reviews === null) return <ListSkeleton count={2} />;

  if (reviews.length === 0) {
    return <p className="text-sm text-foreground/60">You haven&apos;t written any reviews yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {reviews.map((r) => (
        <ReviewRow key={r.id} review={r} targetName={names[r.target_id]} />
      ))}
    </ul>
  );
}

function ProfileHome() {
  const { me, logout, token } = useAuth();
  const [gamification, setGamification] = useState<MeGamification | null>(null);
  const [tripCount, setTripCount] = useState<number | null>(null);
  const [bookingCount, setBookingCount] = useState<number | null>(null);
  const [contactCount, setContactCount] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getMyGamification(token).then(setGamification).catch(() => {});
    api.listTrips(token).then((t) => setTripCount(t.length)).catch(() => {});
    api.listBookings(token).then((b) => setBookingCount(b.length)).catch(() => {});
    api.listTrustedContacts(token).then((c) => setContactCount(c.length)).catch(() => {});
  }, [token]);

  if (!me) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-8" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading profile…</span>
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-6">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-xl font-semibold text-primary">
            {initialsFrom(me.email, me.phone)}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{me.email ?? me.phone}</h1>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {ACCOUNT_TYPE_LABELS[me.account_type] ?? me.account_type}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  me.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                }`}
              >
                {me.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground/55">
              {me.email && (
                <span className="flex items-center gap-1">
                  <MailIcon width={13} height={13} />
                  {me.email}
                </span>
              )}
              {me.phone && (
                <span className="flex items-center gap-1">
                  <PhoneIcon width={13} height={13} />
                  {me.phone}
                </span>
              )}
              <span>Member since {new Date(me.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted"
        >
          <LogoutIcon width={14} height={14} />
          Log out
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm text-foreground/55">Travel Passport points</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{gamification?.points.total_points ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm text-foreground/55">Trips planned</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{tripCount ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm text-foreground/55">Bookings made</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{bookingCount ?? "—"}</div>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserIcon width={16} height={16} />
          </span>
          <h2 className="text-lg font-semibold">Account details</h2>
        </div>
        <LanguageSection initialLanguage={me.preferred_language} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockIcon width={16} height={16} />
          </span>
          <h2 className="text-lg font-semibold">Security</h2>
        </div>
        <PasswordSection />
      </section>

      {me.account_type === "business" && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BuildingIcon width={16} height={16} />
            </span>
            <h2 className="text-lg font-semibold">My business</h2>
          </div>
          <MyBusinessesSection />
        </section>
      )}

      {me.account_type === "guide" && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UsersIcon width={16} height={16} />
            </span>
            <h2 className="text-lg font-semibold">My guide profile</h2>
          </div>
          <MyGuideProfileSection />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Explore &amp; manage</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <HubCard
            href="/gamification"
            icon={<StarIcon width={16} height={16} />}
            label="Travel Passport"
            detail={
              gamification
                ? `${gamification.points.total_points} pts · ${gamification.badges.length} badges`
                : "Points, badges & leaderboard"
            }
          />
          <HubCard
            href="/trips"
            icon={<CompassIcon width={16} height={16} />}
            label="My trips"
            detail={tripCount !== null ? `${tripCount} planned trip${tripCount === 1 ? "" : "s"}` : "AI-planned itineraries"}
          />
          <HubCard
            href="/bookings"
            icon={<TicketIcon width={16} height={16} />}
            label="My bookings"
            detail={bookingCount !== null ? `${bookingCount} booking${bookingCount === 1 ? "" : "s"}` : "Businesses & guides"}
          />
          <HubCard
            href="/accessibility"
            icon={<ShieldIcon width={16} height={16} />}
            label="Accessibility & travel profile"
            detail="Site display & traveler-type preferences"
          />
          <HubCard
            href="/trusted-contacts"
            icon={<UsersIcon width={16} height={16} />}
            label="Trusted contacts"
            detail={contactCount !== null ? `${contactCount} contact${contactCount === 1 ? "" : "s"}` : "Emergency contacts"}
          />
          <HubCard
            href="/location-sharing"
            icon={<MapPinIcon width={16} height={16} />}
            label="Live location sharing"
            detail="Share with a contact or your group"
          />
          <HubCard
            href="/notifications"
            icon={<BellIcon width={16} height={16} />}
            label="Notifications"
            detail="Alerts & preferences"
          />
          <HubCard
            href="/consents"
            icon={<ShieldIcon width={16} height={16} />}
            label="Privacy"
            detail="Consents & data sharing"
          />
          <HubCard
            href="/lost-found"
            icon={<CompassIcon width={16} height={16} />}
            label="Lost & Found"
            detail="Your lost/found reports"
          />
          <HubCard
            href="/trust/fraud"
            icon={<ShieldIcon width={16} height={16} />}
            label="Fraud reports"
            detail="Reports you've filed"
          />
          {me.account_type === "authority" && (
            <HubCard
              href="/authority"
              icon={<MapPinIcon width={16} height={16} />}
              label="Authority tools"
              detail="Dashboard, SOS & incidents"
            />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarIcon width={16} height={16} />
          </span>
          <h2 className="text-lg font-semibold">My reviews</h2>
        </div>
        <MyReviewsSection />
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileHome />
    </RequireAuth>
  );
}
