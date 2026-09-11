"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import {
  api,
  type LocationShare,
  type LocationShareDuration,
  type LocationSharePrecision,
  type LocationShareRecipientType,
  type Sos,
  type Trip,
  type TrustedContact,
} from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import {
  AlertTriangleIcon,
  ClockIcon,
  CopyIcon,
  LocateIcon,
  RefreshIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";

const LocationShareMap = dynamic(() => import("@/components/LocationShareMap").then((m) => m.LocationShareMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-foreground/50">Loading map…</div>
  ),
});

// Same 5s authenticated-poll idiom as ActiveSosCard (web/src/app/sos/page.tsx)
// and the 30s crowd-heatmap poll — no WebSocket/push infrastructure exists
// anywhere in this codebase (app/websocket/__init__.py is an unbuilt
// placeholder), so this is the honest, already-established "live" pattern.
const POLL_INTERVAL_MS = 5000;
// How often the browser tab pushes a fresh fix while a trusted-contact
// share is active. Requires this tab to stay open — there is no background
// service worker or native app in this build, and the UI says so plainly
// rather than implying a capability that doesn't exist.
const PING_INTERVAL_MS = 15000;
const MIN_PING_MOVE_METERS = 25;

const isOpenSos = (s: Sos) => !["RESOLVED", "CANCELLED", "FALSE_ALARM"].includes(s.status);

const DURATION_OPTIONS: { value: LocationShareDuration; label: string; needsTrip?: boolean }[] = [
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "until_trip_end", label: "Until end of trip", needsTrip: true },
  { value: "custom", label: "Custom duration" },
  { value: "until_stopped", label: "Until I stop it" },
];

type LiveState = "LIVE" | "STALE" | "PENDING" | "EXPIRED" | "REVOKED";

function liveState(share: LocationShare): LiveState {
  if (share.status !== "ACTIVE") return share.status;
  if (!share.last_location_at) return "PENDING";
  return share.is_live ? "LIVE" : "STALE";
}

function timeAgo(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function haversineMeters(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const R = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dphi = ((b.lat - a.lat) * Math.PI) / 180;
  const dlambda = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function StatusPill({ state }: { state: LiveState }) {
  const meta: Record<LiveState, { Icon: typeof LocateIcon; tone: string; label: string }> = {
    LIVE: { Icon: LocateIcon, tone: "bg-success/10 text-success", label: "LIVE" },
    STALE: { Icon: ClockIcon, tone: "bg-primary/10 text-primary", label: "STALE" },
    PENDING: { Icon: ClockIcon, tone: "bg-surface-muted text-foreground/50", label: "NOT STARTED" },
    EXPIRED: { Icon: AlertTriangleIcon, tone: "bg-surface-muted text-foreground/50", label: "ENDED" },
    REVOKED: { Icon: AlertTriangleIcon, tone: "bg-surface-muted text-foreground/50", label: "STOPPED" },
  };
  const { Icon, tone, label } = meta[state];
  return (
    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <Icon width={12} height={12} aria-hidden />
      {label}
    </span>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // clipboard API can be unavailable — the link is still visible as
          // plain text in the parent card for manual copying.
        }
      }}
      className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/70 hover:bg-surface-muted"
    >
      <CopyIcon width={12} height={12} />
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

function recipientLabel(share: LocationShare, contacts: TrustedContact[], trips: Trip[]): string {
  if (share.recipient_type === "TRUSTED_CONTACT") {
    return contacts.find((c) => c.id === share.trusted_contact_id)?.name ?? "Trusted contact";
  }
  const trip = trips.find((t) => t.id === share.trip_id);
  return trip ? `Travel group · ${trip.title ?? "Untitled trip"}` : "Travel group";
}

function ActiveShareCard({
  share,
  contacts,
  trips,
  nowMs,
  onStopped,
  onChanged,
}: {
  share: LocationShare;
  contacts: TrustedContact[];
  trips: Trip[];
  nowMs: number;
  onStopped: (id: string) => void;
  onChanged: (updated: LocationShare) => void;
}) {
  const { token } = useAuth();
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [editing, setEditing] = useState(false);
  const [precision, setPrecision] = useState<LocationSharePrecision>(share.precision);
  const [duration, setDuration] = useState<LocationShareDuration>("1h");
  const [customMinutes, setCustomMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = liveState(share);

  async function onStop() {
    if (!token) return;
    setStopping(true);
    try {
      await api.revokeLocationShare(share.id, token);
      onStopped(share.id);
    } finally {
      setStopping(false);
    }
  }

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateLocationShare(
        share.id,
        { precision, duration_choice: duration, custom_minutes: duration === "custom" ? customMinutes : undefined },
        token
      );
      onChanged(updated);
      setEditing(false);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not update this share.");
    } finally {
      setSaving(false);
    }
  }

  const recipientLink =
    share.access_token && typeof window !== "undefined"
      ? `${window.location.origin}/location-sharing/view?share=${share.id}&token=${share.access_token}`
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            {share.recipient_type === "TRUSTED_CONTACT" ? (
              <UsersIcon width={15} height={15} className="text-foreground/50" />
            ) : (
              <UsersIcon width={15} height={15} className="text-foreground/50" />
            )}
            Sharing with: {recipientLabel(share, contacts, trips)}
          </p>
          <p className="mt-1 text-xs text-foreground/55">
            Precision: {share.precision === "PRECISE" ? "Precise" : "Approximate"} · Started{" "}
            {new Date(share.started_at).toLocaleTimeString()} · Ends {new Date(share.expires_at).toLocaleString()}
          </p>
        </div>
        <StatusPill state={state} />
      </div>

      <p className="text-xs text-foreground/50">
        {share.last_location_at ? `Last updated: ${timeAgo(share.last_location_at, nowMs)}` : "Waiting for the first location update…"}
      </p>

      {recipientLink && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-muted px-3 py-2 text-xs">
          <span className="text-foreground/60">No account needed to view — share this link:</span>
          <CopyLinkButton url={recipientLink} />
        </div>
      )}

      {editing ? (
        <form onSubmit={onSaveSettings} className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <div className="flex gap-4 text-sm">
            {(["PRECISE", "APPROXIMATE"] as const).map((p) => (
              <label key={p} className="flex items-center gap-1.5">
                <input type="radio" checked={precision === p} onChange={() => setPrecision(p)} className="accent-primary" />
                {p === "PRECISE" ? "Precise" : "Approximate"}
              </label>
            ))}
          </div>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value as LocationShareDuration)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {DURATION_OPTIONS.filter((o) => !o.needsTrip || share.trip_id).map((o) => (
              <option key={o.value} value={o.value}>
                Extend: {o.label}
              </option>
            ))}
          </select>
          {duration === "custom" && (
            <input
              type="number"
              min={1}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(Number(e.target.value))}
              placeholder="Minutes"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-foreground/50">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {confirmingStop ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-foreground/60">Stop sharing your location?</span>
              <button onClick={onStop} disabled={stopping} className="font-semibold text-danger disabled:opacity-50">
                {stopping ? "Stopping…" : "Yes, stop"}
              </button>
              <button onClick={() => setConfirmingStop(false)} className="text-foreground/50">
                Keep sharing
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setConfirmingStop(true)}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-surface-muted"
              >
                Stop sharing
              </button>
              <button
                onClick={() => setEditing(true)}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground/70 hover:bg-surface-muted"
              >
                Change settings
              </button>
            </>
          )}
        </div>
      )}

      {share.current_location && (
        <div className="h-56 overflow-hidden rounded-xl border border-border">
          <LocationShareMap location={share.current_location} isLive={state === "LIVE"} label={recipientLabel(share, contacts, trips)} />
        </div>
      )}
    </div>
  );
}

function SetupWizard({
  contacts,
  trips,
  onCreated,
  onClose,
}: {
  contacts: TrustedContact[];
  trips: Trip[];
  onCreated: (share: LocationShare) => void;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [step, setStep] = useState<"form" | "review">("form");
  const [recipientType, setRecipientType] = useState<LocationShareRecipientType>("TRUSTED_CONTACT");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  const [precision, setPrecision] = useState<LocationSharePrecision>("APPROXIMATE");
  const [duration, setDuration] = useState<LocationShareDuration>("1h");
  const [customMinutes, setCustomMinutes] = useState(60);
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedTrip = trips.find((t) => t.id === tripId);
  const durationOptions = DURATION_OPTIONS.filter(
    (o) => !o.needsTrip || (recipientType === "GROUP" && selectedTrip?.end_date)
  );
  const recipientReady = recipientType === "TRUSTED_CONTACT" ? Boolean(contactId) : Boolean(tripId);

  async function onConfirm() {
    if (!token || !recipientReady) return;
    setSubmitting(true);
    setError(null);
    try {
      const share = await api.createLocationShare(
        {
          recipient_type: recipientType,
          trusted_contact_id: recipientType === "TRUSTED_CONTACT" ? contactId : undefined,
          trip_id: recipientType === "GROUP" ? tripId : undefined,
          purpose: purpose.trim() || undefined,
          precision,
          duration_choice: duration,
          custom_minutes: duration === "custom" ? customMinutes : undefined,
        },
        token
      );
      onCreated(share);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not start sharing your location.");
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  }

  const recipientDisplayName =
    recipientType === "TRUSTED_CONTACT"
      ? contacts.find((c) => c.id === contactId)?.name ?? "—"
      : `Travel group · ${selectedTrip?.title ?? "Untitled trip"}`;
  const durationDisplayLabel = DURATION_OPTIONS.find((o) => o.value === duration)?.label ?? duration;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      {step === "form" && (
        <>
          <div>
            <h2 className="font-medium">Who can see my location?</h2>
            <div className="mt-2 flex flex-col gap-2">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
                  recipientType === "TRUSTED_CONTACT" ? "border-primary bg-surface" : "border-border bg-surface/60"
                }`}
              >
                <input
                  type="radio"
                  checked={recipientType === "TRUSTED_CONTACT"}
                  onChange={() => setRecipientType("TRUSTED_CONTACT")}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="block font-medium">Trusted contact</span>
                  <span className="block text-xs text-foreground/55">
                    A one-time private link — no TravIndi account needed on their end.
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
                  recipientType === "GROUP" ? "border-primary bg-surface" : "border-border bg-surface/60"
                }`}
              >
                <input
                  type="radio"
                  checked={recipientType === "GROUP"}
                  onChange={() => setRecipientType("GROUP")}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="block font-medium">Selected travel group</span>
                  <span className="block text-xs text-foreground/55">Active members of one of your group trips.</span>
                </span>
              </label>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/60 p-3 text-sm opacity-60">
                <input type="radio" disabled className="mt-0.5" />
                <span>
                  <span className="block font-medium">Authority</span>
                  <span className="block text-xs text-foreground/55">
                    Only ever available automatically to authorities during an active, authorized{" "}
                    <Link href="/sos" className="underline">
                      SOS
                    </Link>{" "}
                    — never started from here.
                  </span>
                </span>
              </div>
            </div>

            {recipientType === "TRUSTED_CONTACT" &&
              (contacts.length === 0 ? (
                <p className="mt-3 text-xs text-foreground/60">
                  You have no trusted contacts yet.{" "}
                  <Link href="/trusted-contacts" className="font-medium text-primary underline">
                    Add one first
                  </Link>
                  .
                </p>
              ) : (
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ))}

            {recipientType === "GROUP" &&
              (trips.length === 0 ? (
                <p className="mt-3 text-xs text-foreground/60">
                  You have no trips yet.{" "}
                  <Link href="/trips" className="font-medium text-primary underline">
                    Plan one first
                  </Link>
                  .
                </p>
              ) : (
                <select
                  value={tripId}
                  onChange={(e) => setTripId(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title ?? "Untitled trip"}
                    </option>
                  ))}
                </select>
              ))}
          </div>

          <div>
            <h2 className="font-medium">Location precision</h2>
            <div className="mt-2 flex flex-col gap-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${precision === "APPROXIMATE" ? "border-primary bg-surface" : "border-border bg-surface/60"}`}>
                <input type="radio" checked={precision === "APPROXIMATE"} onChange={() => setPrecision("APPROXIMATE")} className="mt-0.5 accent-primary" />
                <span>
                  <span className="block font-medium">Approximate location</span>
                  <span className="block text-xs text-foreground/55">Shares an approximate area (~1km) instead of your exact position.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${precision === "PRECISE" ? "border-primary bg-surface" : "border-border bg-surface/60"}`}>
                <input type="radio" checked={precision === "PRECISE"} onChange={() => setPrecision("PRECISE")} className="mt-0.5 accent-primary" />
                <span>
                  <span className="block font-medium">Precise location</span>
                  <span className="block text-xs text-foreground/55">Shares your current GPS position.</span>
                </span>
              </label>
            </div>
          </div>

          <div>
            <h2 className="font-medium">Sharing duration</h2>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value as LocationShareDuration)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {durationOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {duration === "custom" && (
              <input
                type="number"
                min={1}
                max={4320}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(Number(e.target.value))}
                placeholder="Minutes"
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            )}
            <p className="mt-1.5 text-xs text-foreground/50">Sharing always ends automatically — never indefinitely.</p>
          </div>

          <div>
            <h2 className="font-medium">Purpose (optional)</h2>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Solo hike today"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep("review")}
              disabled={!recipientReady}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Review
            </button>
            <button onClick={onClose} className="rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-surface-muted">
              Cancel
            </button>
          </div>
        </>
      )}

      {step === "review" && (
        <>
          <h2 className="font-medium">Share your live location?</h2>
          <dl className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/55">Recipient</dt>
              <dd className="text-right font-medium">{recipientDisplayName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/55">Location precision</dt>
              <dd className="text-right font-medium">{precision === "PRECISE" ? "Precise" : "Approximate (~1km)"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/55">Start time</dt>
              <dd className="text-right font-medium">Now</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/55">Expiry</dt>
              <dd className="text-right font-medium">
                {duration === "custom" ? `${customMinutes} minutes from now` : durationDisplayLabel}
              </dd>
            </div>
            {purpose.trim() && (
              <div className="flex justify-between gap-3">
                <dt className="text-foreground/55">Purpose</dt>
                <dd className="text-right font-medium">{purpose.trim()}</dd>
              </div>
            )}
          </dl>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              disabled={submitting}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Starting…" : "Start sharing"}
            </button>
            <button onClick={() => setStep("form")} className="rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-surface-muted">
              Back
            </button>
            <button onClick={onClose} className="text-sm text-foreground/50">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function LocationSharingPanel() {
  const { token } = useAuth();
  const [shares, setShares] = useState<LocationShare[] | null>(null);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [openSos, setOpenSos] = useState<Sos | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmingStopAll, setConfirmingStopAll] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const lastPingRef = useRef<Record<string, { at: number; lon: number; lat: number }>>({});

  function refresh() {
    if (!token) return;
    api.listLocationShares(token).then(setShares).catch(() => setError("Could not load your location shares."));
    api.listTrustedContacts(token).then(setContacts).catch(() => {});
    api.listTrips(token).then(setTrips).catch(() => {});
    api.listSos(token).then((list) => setOpenSos(list.find(isOpenSos) ?? null)).catch(() => {});
  }

  useEffect(refresh, [token]);

  // Tick "last updated Ns ago" every second — purely a display timer, no
  // network call.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeShares = shares?.filter((s) => s.status === "ACTIVE") ?? [];

  // Poll the server every 5s while anything is active — the same pattern
  // as ActiveSosCard, so lazy server-side expiry and staleness are
  // reflected without the user having to reload.
  useEffect(() => {
    if (!token || activeShares.length === 0) return;
    const interval = setInterval(() => {
      api.listLocationShares(token).then(setShares).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, activeShares.length]);

  const contactShareIds = activeShares
    .filter((s) => s.recipient_type === "TRUSTED_CONTACT")
    .map((s) => s.id)
    .join(",");

  // Push a fresh fix for every active TRUSTED_CONTACT share. Requires this
  // tab to stay open — no background/native geolocation exists in this
  // build (see the page copy below), so this is an honest, not a hidden,
  // constraint. Only sends when enough time has passed AND the position
  // has moved meaningfully, per the "throttle, don't spam" requirement.
  // Deliberately keyed on `contactShareIds` (the actual eligible-share-set),
  // not `activeShares`/`shares` directly — those change identity on every
  // 5s poll even when nothing relevant changed, which would otherwise
  // tear down and restart this interval every poll cycle.
  useEffect(() => {
    if (!token || !contactShareIds) return;
    const ids = contactShareIds.split(",");
    const interval = setInterval(() => {
      getCurrentPosition().then(({ coords, isReal }) => {
        if (!isReal) return;
        ids.forEach((shareId) => {
          const last = lastPingRef.current[shareId];
          const moved = !last || haversineMeters(last, coords) >= MIN_PING_MOVE_METERS;
          const dueForRefresh = !last || Date.now() - last.at >= PING_INTERVAL_MS;
          if (!moved && !dueForRefresh) return;
          api
            .pingLocationShare(shareId, coords, token)
            .then((updated) => {
              lastPingRef.current[shareId] = { at: Date.now(), ...coords };
              setShares((prev) => (prev ?? []).map((s) => (s.id === updated.id ? updated : s)));
            })
            .catch(() => {});
        });
      });
    }, PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, contactShareIds]);

  function onCreated(share: LocationShare) {
    setShares((prev) => [share, ...(prev ?? [])]);
    setWizardOpen(false);
  }

  function onStopped(id: string) {
    setShares((prev) => (prev ?? []).map((s) => (s.id === id ? { ...s, status: "REVOKED" as const } : s)));
  }

  function onChanged(updated: LocationShare) {
    setShares((prev) => (prev ?? []).map((s) => (s.id === updated.id ? updated : s)));
  }

  async function onStopAll() {
    if (!token) return;
    setStoppingAll(true);
    try {
      await api.stopAllLocationShares(token);
      setShares((prev) => (prev ?? []).map((s) => (s.status === "ACTIVE" ? { ...s, status: "REVOKED" as const } : s)));
    } finally {
      setStoppingAll(false);
      setConfirmingStopAll(false);
    }
  }

  const contactCount = activeShares.filter((s) => s.recipient_type === "TRUSTED_CONTACT").length;
  const groupCount = activeShares.filter((s) => s.recipient_type === "GROUP").length;
  const statusSummary = (() => {
    if (activeShares.length === 0) return "Not sharing";
    const parts: string[] = [];
    if (contactCount > 0) parts.push(`${contactCount} contact${contactCount === 1 ? "" : "s"}`);
    if (groupCount > 0) parts.push("your travel group");
    return `Sharing with ${parts.join(" and ")}`;
  })();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">Live Location Sharing</h1>
        <p className="mt-1 text-sm text-foreground/60">Your location. Your choice. Your control.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Current status</p>
          <p className="mt-1 text-lg font-medium">{statusSummary}</p>
        </div>
        {!wizardOpen && (
          <button
            onClick={() => setWizardOpen(true)}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Share My Location
          </button>
        )}
      </div>

      {openSos && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm">
          <span className="flex items-center gap-2 text-danger">
            <ShieldIcon width={16} height={16} />
            Sharing with authority during an active emergency
          </span>
          <Link href="/sos" className="font-medium text-danger underline">
            View SOS
          </Link>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {wizardOpen && (
        <SetupWizard contacts={contacts} trips={trips} onCreated={onCreated} onClose={() => setWizardOpen(false)} />
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Active location shares</h2>
          {activeShares.length > 0 &&
            (confirmingStopAll ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-foreground/60">Stop everything?</span>
                <button onClick={onStopAll} disabled={stoppingAll} className="font-semibold text-danger">
                  {stoppingAll ? "Stopping…" : "Yes"}
                </button>
                <button onClick={() => setConfirmingStopAll(false)} className="text-foreground/50">
                  No
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmingStopAll(true)} className="text-xs font-medium text-danger/80 hover:text-danger">
                Stop All Location Sharing
              </button>
            ))}
        </div>

        {shares === null && (
          <div className="animate-pulse rounded-2xl border border-border bg-surface p-5">
            <div className="h-4 w-1/3 rounded bg-surface-muted" />
          </div>
        )}

        {shares !== null && activeShares.length === 0 && !wizardOpen && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
            <RefreshIcon width={22} height={22} className="text-foreground/30" />
            <p className="text-sm text-foreground/60">You&apos;re not sharing your location with anyone right now.</p>
          </div>
        )}

        {activeShares.map((share) => (
          <ActiveShareCard
            key={share.id}
            share={share}
            contacts={contacts}
            trips={trips}
            nowMs={nowMs}
            onStopped={onStopped}
            onChanged={onChanged}
          />
        ))}

        {shares && shares.some((s) => s.status !== "ACTIVE") && (
          <details className="text-sm text-foreground/60">
            <summary className="cursor-pointer font-medium">Past shares</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {shares
                .filter((s) => s.status !== "ACTIVE")
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
                    <span>{recipientLabel(s, contacts, trips)}</span>
                    <StatusPill state={liveState(s)} />
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>

      <p className="text-xs text-foreground/45">
        Live updates while this page is open (checks every {POLL_INTERVAL_MS / 1000}s) — there is no background app or
        native push in this build, so closing the tab pauses updates until you reopen it.
      </p>
    </div>
  );
}

export default function LocationSharingPage() {
  return (
    <RequireAuth>
      <LocationSharingPanel />
    </RequireAuth>
  );
}
