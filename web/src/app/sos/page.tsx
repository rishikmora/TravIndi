"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Sos } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { CheckCircleIcon, ClockIcon, CopyIcon, MapPinIcon, ShieldIcon, UsersIcon } from "@/components/icons";

const isOpen = (s: Sos) => !["RESOLVED", "CANCELLED", "FALSE_ALARM"].includes(s.status);
const COUNTDOWN_SECONDS = 3;

const EMERGENCY_TYPES: { value: string; label: string }[] = [
  { value: "general", label: "General" },
  { value: "medical", label: "Medical" },
  { value: "safety", label: "Safety threat" },
  { value: "lost", label: "Lost / stranded" },
];

function statusMeta(status: string) {
  if (status === "ACKNOWLEDGED") return { label: "Acknowledged", tone: "text-primary" };
  if (status === "RESOLVED") return { label: "Resolved", tone: "text-success" };
  if (status === "FALSE_ALARM") return { label: "False alarm", tone: "text-foreground/50" };
  if (status === "CANCELLED") return { label: "Cancelled", tone: "text-foreground/50" };
  return { label: "Sent · awaiting response", tone: "text-danger" };
}

function StatusTimeline({ sos }: { sos: Sos }) {
  const acknowledged = sos.status !== "CREATED";
  const resolved = sos.status === "RESOLVED" || sos.status === "FALSE_ALARM";
  const cancelled = sos.status === "CANCELLED";

  const steps = [
    { label: "Sent", done: true, at: sos.created_at },
    { label: "Acknowledged", done: acknowledged || cancelled, at: acknowledged ? sos.updated_at : null },
    { label: sos.status === "FALSE_ALARM" ? "False alarm" : "Resolved", done: resolved || cancelled, at: resolved ? sos.resolved_at : null },
  ];

  return (
    <div className="flex w-full items-start justify-between gap-1">
      {steps.map((step, i) => (
        <div key={step.label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
          <div className="flex w-full items-center">
            {i > 0 && <span className={`h-0.5 flex-1 ${step.done ? "bg-danger" : "bg-border"}`} />}
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                step.done ? "border-danger bg-danger text-white" : "border-border bg-surface text-foreground/30"
              }`}
            >
              {step.done ? <CheckCircleIcon width={13} height={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            {i < steps.length - 1 && <span className={`h-0.5 flex-1 ${steps[i + 1].done ? "bg-danger" : "bg-border"}`} />}
          </div>
          <span className={`text-[11px] font-medium ${step.done ? "text-foreground" : "text-foreground/40"}`}>{step.label}</span>
        </div>
      ))}
    </div>
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
          // clipboard API can be unavailable (e.g. insecure context) — the
          // link is still shown as plain text below for manual copying.
        }
      }}
      className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/70 hover:bg-surface-muted"
    >
      <CopyIcon width={12} height={12} />
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

function ActiveSosCard({ sos, onCancelled, onUpdated }: { sos: Sos; onCancelled: (s: Sos) => void; onUpdated: (s: Sos) => void }) {
  const { token } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const meta = statusMeta(sos.status);

  useEffect(() => {
    if (!token || !isOpen(sos)) return;
    const interval = setInterval(() => {
      // GET /sos/{id} never re-returns trusted_contact_tokens (the raw
      // one-time tokens only exist in the create response, never stored
      // retrievably) — preserve the ones already known so a poll doesn't
      // silently erase the links from view.
      api
        .getSos(sos.id, token)
        .then((fresh) => onUpdated({ ...fresh, trusted_contact_tokens: sos.trusted_contact_tokens }))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sos.id, sos.status]);

  async function onCancel() {
    if (!token) return;
    setCancelling(true);
    try {
      const updated = await api.cancelSos(sos.id, token);
      onCancelled(updated);
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-danger/30 bg-danger/5 p-6 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white">
        <span className="absolute inset-0 animate-ping rounded-full bg-danger/50" />
        <ShieldIcon width={28} height={28} />
      </span>
      <div>
        <p className={`text-sm font-semibold uppercase tracking-wide ${meta.tone}`}>{meta.label}</p>
        <p className="mt-1 text-xs text-foreground/55">
          Sent {new Date(sos.created_at).toLocaleTimeString()} · Your app-side acknowledgement is
          {sos.local_ack_at ? " confirmed" : " pending"}.
        </p>
      </div>

      <StatusTimeline sos={sos} />

      {sos.status === "ACKNOWLEDGED" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
          Help is on the way — an authority responder has acknowledged your SOS.
        </p>
      )}

      {sos.trusted_contact_tokens.length > 0 && (
        <div className="w-full rounded-xl border border-border bg-surface p-3 text-left text-xs">
          <p className="mb-2 flex items-center gap-1.5 font-medium text-foreground/70">
            <UsersIcon width={13} height={13} />
            Trusted-contact links issued (no SMS in this prototype — share these directly)
          </p>
          <div className="flex flex-col gap-2">
            {sos.trusted_contact_tokens.map((t) => {
              const url =
                typeof window !== "undefined" ? `${window.location.origin}/verify?sos=${sos.id}&token=${t.token}` : "";
              return (
                <div key={t.trusted_contact_id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2">
                  <span className="font-medium">{t.trusted_contact_name}</span>
                  <CopyLinkButton url={url} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isOpen(sos) &&
        (confirmingCancel ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground/60">Only cancel if you&apos;re safe now.</span>
            <button onClick={onCancel} disabled={cancelling} className="font-semibold text-danger disabled:opacity-50">
              {cancelling ? "Cancelling…" : "Yes, I'm safe"}
            </button>
            <button onClick={() => setConfirmingCancel(false)} className="text-foreground/50">
              Keep it active
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingCancel(true)}
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted"
          >
            I&apos;m safe — cancel SOS
          </button>
        ))}
    </div>
  );
}

function TriggerButton({ onFire }: { onFire: (emergencyType: string) => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [emergencyType, setEmergencyType] = useState("general");
  const [firing, setFiring] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown() {
    setArmed(true);
    setSecondsLeft(COUNTDOWN_SECONDS);
    let remaining = COUNTDOWN_SECONDS;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setFiring(true);
        onFire(emergencyType).finally(() => {
          setArmed(false);
          setFiring(false);
        });
      }
    }, 1000);
  }

  function cancelCountdown() {
    if (timerRef.current) clearInterval(timerRef.current);
    setArmed(false);
  }

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  if (armed) {
    const progress = ((COUNTDOWN_SECONDS - secondsLeft) / COUNTDOWN_SECONDS) * 100;
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-40 w-40 items-center justify-center rounded-full">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-border)" strokeWidth="6" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="var(--color-danger)"
              strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="text-4xl font-bold text-danger">{firing ? "…" : secondsLeft}</span>
        </div>
        <p className="text-sm font-medium text-foreground/70">
          {firing ? "Sending…" : "Sending SOS unless you cancel"}
        </p>
        {!firing && (
          <button
            onClick={cancelCountdown}
            className="rounded-full border border-border bg-surface px-6 py-2.5 text-sm font-semibold hover:bg-surface-muted"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <button
        onClick={startCountdown}
        className="flex h-40 w-40 flex-col items-center justify-center gap-1 rounded-full bg-danger text-white shadow-lg transition hover:brightness-110 active:scale-95"
      >
        <ShieldIcon width={32} height={32} />
        <span className="text-lg font-bold tracking-wide">SOS</span>
        <span className="text-[10px] font-medium opacity-80">Tap to send</span>
      </button>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {EMERGENCY_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setEmergencyType(t.value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              emergencyType === t.value ? "border-danger bg-danger/10 text-danger" : "border-border text-foreground/55"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryList({ history }: { history: Sos[] }) {
  if (history.length === 0) return null;
  return (
    <div className="w-full">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
        <ClockIcon width={13} height={13} />
        Past SOS requests
      </h2>
      <ul className="flex flex-col gap-2">
        {history.map((s) => {
          const meta = statusMeta(s.status);
          return (
            <li key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm">
              <span className="flex items-center gap-2">
                <MapPinIcon width={14} height={14} className="text-foreground/40" />
                {new Date(s.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
              <span className={`text-xs font-medium uppercase ${meta.tone}`}>{meta.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SosPanel() {
  const { token } = useAuth();
  const [active, setActive] = useState<Sos | null>(null);
  const [history, setHistory] = useState<Sos[]>([]);
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [usedFallbackLocation, setUsedFallbackLocation] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .listSos(token)
      .then((list) => {
        setHistory(list.filter((s) => !isOpen(s)));
        setActive(list.find(isOpen) ?? null);
      })
      .catch(() => {});
    api.listTrustedContacts(token).then((list) => setContactCount(list.length)).catch(() => {});
  }, [token]);

  async function onFire(emergencyType: string) {
    if (!token) return;
    setError(null);
    setLocating(true);
    try {
      const { coords, isReal } = await getCurrentPosition();
      setUsedFallbackLocation(!isReal);
      const sos = await api.createSos({ lon: coords.lon, lat: coords.lat, emergency_type: emergencyType }, token);
      setActive(sos);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not send SOS. Please try again.");
    } finally {
      setLocating(false);
    }
  }

  function onCancelled(updated: Sos) {
    setActive(null);
    setHistory((h) => [updated, ...h]);
  }

  function onUpdated(updated: Sos) {
    setActive(updated);
    if (!isOpen(updated)) {
      setHistory((h) => [updated, ...h.filter((s) => s.id !== updated.id)]);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="font-display text-2xl">Emergency SOS</h1>
        <p className="mt-1 text-sm text-foreground/60">
          One tap alerts authority responders with your live location and notifies your trusted contacts.
        </p>
      </div>

      {contactCount === 0 && !active && (
        <div className="w-full rounded-xl border border-primary/30 bg-primary/5 p-3 text-center text-xs">
          <p className="text-foreground/70">
            You haven&apos;t added a trusted contact yet — add one so someone is notified automatically when you send an
            SOS.
          </p>
          <Link href="/trusted-contacts" className="mt-1 inline-block font-medium text-primary underline">
            Add a trusted contact
          </Link>
        </div>
      )}

      {active ? (
        <ActiveSosCard sos={active} onCancelled={onCancelled} onUpdated={onUpdated} />
      ) : (
        <TriggerButton onFire={onFire} />
      )}

      {locating && <p className="text-xs text-foreground/50">Getting your location…</p>}
      {usedFallbackLocation && !locating && (
        <p className="text-xs text-foreground/45">
          Couldn&apos;t access your device location — used a default location instead.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {!active && (
        <p className="text-center text-xs text-foreground/45">
          Not an emergency?{" "}
          <Link href="/report" className="font-medium text-primary underline">
            Report an incident
          </Link>{" "}
          instead.
        </p>
      )}

      <HistoryList history={history} />
    </div>
  );
}

export default function SosPage() {
  return (
    <RequireAuth>
      <SosPanel />
    </RequireAuth>
  );
}
