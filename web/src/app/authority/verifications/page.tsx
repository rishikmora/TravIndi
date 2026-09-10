"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Verification, type VerificationStatus } from "@/lib/api";
import { ArrowRightIcon, BuildingIcon, CheckCircleIcon, UsersIcon } from "@/components/icons";

const STATUS_TABS: { value: VerificationStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

function VerificationRow({
  v,
  subjectName,
  onDecided,
}: {
  v: Verification;
  subjectName: string | undefined;
  onDecided: () => void;
}) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function onApprove() {
    if (!token) return;
    setError(null);
    setBusy("approve");
    try {
      await api.approveVerification(v.id, token);
      onDecided();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not approve.");
    } finally {
      setBusy(null);
    }
  }

  async function onReject() {
    if (!token) return;
    setError(null);
    setBusy("reject");
    try {
      await api.rejectVerification(v.id, reason || "Not eligible.", token);
      onDecided();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not reject.");
    } finally {
      setBusy(null);
    }
  }

  const Icon = v.subject_type === "GUIDE" ? UsersIcon : BuildingIcon;
  const href = v.subject_type === "GUIDE" ? `/guides/${v.subject_id}` : `/businesses/${v.subject_id}`;

  return (
    <li className="rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <Link href={href} className="flex items-center gap-2 font-medium hover:text-primary">
          <Icon width={14} height={14} className="text-foreground/50" />
          {subjectName ?? `${v.subject_type.toLowerCase()} · ${v.subject_id.slice(0, 8)}…`}
          <ArrowRightIcon width={12} height={12} className="text-foreground/30" />
        </Link>
        <span
          className={`shrink-0 text-xs font-medium uppercase ${
            v.status === "APPROVED" ? "text-success" : v.status === "REJECTED" ? "text-danger" : "text-primary"
          }`}
        >
          {v.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-foreground/45">Submitted {new Date(v.created_at).toLocaleString()}</p>

      {v.status === "PENDING" && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {rejecting && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection reason"
              autoFocus
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            {!rejecting && (
              <button
                onClick={onApprove}
                disabled={busy !== null}
                className="flex items-center gap-1 rounded-full bg-success/10 px-3 py-1.5 text-xs font-medium text-success disabled:opacity-50"
              >
                <CheckCircleIcon width={12} height={12} />
                {busy === "approve" ? "Approving…" : "Approve"}
              </button>
            )}
            {rejecting ? (
              <>
                <button
                  onClick={onReject}
                  disabled={busy !== null}
                  className="rounded-full bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-50"
                >
                  {busy === "reject" ? "Rejecting…" : "Confirm reject"}
                </button>
                <button onClick={() => setRejecting(false)} className="text-xs text-foreground/50">
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setRejecting(true)}
                disabled={busy !== null}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/60 disabled:opacity-50"
              >
                Reject
              </button>
            )}
          </div>
        </div>
      )}
      {v.rejection_reason && <p className="mt-2 text-xs text-foreground/55">Reason: {v.rejection_reason}</p>}
    </li>
  );
}

function VerificationsQueue() {
  const { token } = useAuth();
  const [verifications, setVerifications] = useState<Verification[] | null>(null);
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<VerificationStatus | "ALL">("PENDING");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!token) return;
    api
      .listVerifications(token, tab === "ALL" ? undefined : tab)
      .then((list) => {
        setVerifications(list);
        setError(null);
      })
      .catch((err) => {
        setError(
          isApiError(err) && err.status === 403
            ? "This queue is only available to authority_verifier accounts (in this demo, log in as test-admin@example.com, which bypasses every policy check)."
            : "Could not load the verification queue."
        );
      });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab]);

  useEffect(() => {
    if (!verifications) return;
    const missing = verifications.filter((v) => !(v.subject_id in subjectNames));
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (v) => {
        try {
          const name =
            v.subject_type === "GUIDE"
              ? (await api.getGuide(v.subject_id)).specialties[0] ?? "Guide"
              : (await api.getBusiness(v.subject_id)).name;
          return [v.subject_id, name] as const;
        } catch {
          return [v.subject_id, undefined] as const;
        }
      })
    ).then((pairs) => {
      setSubjectNames((prev) => {
        const next = { ...prev };
        for (const [id, name] of pairs) if (name) next[id] = name;
        return next;
      });
    });
  }, [verifications, subjectNames]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">Verification queue</h1>
        <p className="mt-1 text-sm text-foreground/60">Business/guide KYC submissions awaiting a decision.</p>
      </div>
      <Link href="/authority" className="text-sm font-medium text-primary underline">
        ← Back to command center
      </Link>

      <div className="flex gap-1.5 rounded-full bg-surface-muted p-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              tab === t.value ? "bg-surface shadow-sm" : "text-foreground/55"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {verifications === null && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-4">
              <div className="h-4 w-1/2 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      )}
      {verifications && verifications.length === 0 && (
        <p className="text-sm text-foreground/60">Nothing here.</p>
      )}
      {verifications && verifications.length > 0 && (
        <ul className="flex flex-col gap-2">
          {verifications.map((v) => (
            <VerificationRow key={v.id} v={v} subjectName={subjectNames[v.subject_id]} onDecided={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function VerificationsPage() {
  return (
    <RequireAuth>
      <VerificationsQueue />
    </RequireAuth>
  );
}
