"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api, type Verification } from "@/lib/api";

function VerificationRow({ v, onDecided }: { v: Verification; onDecided: () => void }) {
  const { token } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function onApprove() {
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      await api.approveVerification(v.id, token);
      onDecided();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not approve.");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      await api.rejectVerification(v.id, reason || "Not eligible.", token);
      onDecided();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not reject.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded border border-black/10 p-3 text-sm dark:border-white/15">
      <div className="flex items-center justify-between">
        <span>
          {v.subject_type} · {v.subject_id.slice(0, 8)}…
        </span>
        <span className="text-xs uppercase text-black/50 dark:text-white/50">{v.status}</span>
      </div>
      {v.status === "PENDING" && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason (if rejecting)"
            className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20 dark:bg-transparent"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              disabled={busy}
              className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}
      {v.rejection_reason && <p className="mt-1 text-xs text-black/60 dark:text-white/60">Reason: {v.rejection_reason}</p>}
    </li>
  );
}

function VerificationsQueue() {
  const { token } = useAuth();
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!token) return;
    api
      .listVerifications(token)
      .then(setVerifications)
      .catch((err) => {
        setError(
          isApiError(err) && err.status === 403
            ? "This queue is only available to authority_verifier accounts (in this demo, log in as test-admin@example.com, which bypasses every policy check)."
            : "Could not load the verification queue."
        );
      });
  }

  useEffect(refresh, [token]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Verification queue</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Business/guide KYC submissions awaiting an authority_verifier decision.
        </p>
      </div>
      <Link href="/authority" className="text-sm underline">
        ← Back to command center
      </Link>
      <ul className="flex flex-col gap-2">
        {verifications.map((v) => (
          <VerificationRow key={v.id} v={v} onDecided={refresh} />
        ))}
        {verifications.length === 0 && <p className="text-sm text-black/60 dark:text-white/60">Nothing pending.</p>}
      </ul>
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
