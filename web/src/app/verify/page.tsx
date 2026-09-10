"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isApiError } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { MapPinIcon, ShieldIcon } from "@/components/icons";

interface VerifyResult {
  sos_id: string;
  status: string;
  emergency_type: string | null;
  created_at: string;
  precise_location: { lon: number; lat: number } | null;
}

function VerifyPanel() {
  const params = useSearchParams();
  const sosId = params.get("sos");
  const token = params.get("token");

  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => Boolean(sosId && token));
  const [otpCode, setOtpCode] = useState("");
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (!sosId || !token) return;
    api
      .verifyTrustedContactToken(sosId, token)
      .then(setResult)
      .catch((err) => setError(isApiError(err) ? err.message : "This link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [sosId, token]);

  async function onRevealLocation() {
    if (!sosId || !token) return;
    setRevealing(true);
    setError(null);
    try {
      const withLocation = await api.verifyTrustedContactToken(sosId, token, otpCode || "demo");
      setResult(withLocation);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not verify the code.");
    } finally {
      setRevealing(false);
    }
  }

  if (!sosId || !token) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-2 pt-12 text-center">
        <h1 className="font-display text-xl">Invalid link</h1>
        <p className="text-sm text-foreground/60">This trusted-contact link is missing its SOS id or token.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 pt-12 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-foreground/60">Checking this link…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-4">
      <div className="text-center">
        <h1 className="font-display text-xl">Someone you know may need help</h1>
        <p className="mt-1 text-sm text-foreground/60">
          You&apos;re seeing this because you&apos;re registered as a trusted contact — no account needed.
        </p>
      </div>

      {error && <p className="text-center text-sm text-danger">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-danger/30 bg-danger/5 p-5 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger text-white">
              <ShieldIcon width={22} height={22} />
            </span>
            <div className="text-sm font-semibold uppercase tracking-wide text-danger">{result.status.replace("_", " ")}</div>
            <div className="text-sm">Type: {result.emergency_type ?? "General"}</div>
            <div className="text-xs text-foreground/55">Triggered {new Date(result.created_at).toLocaleString()}</div>
          </div>

          {result.precise_location ? (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <MapPinIcon width={14} height={14} className="text-primary" />
                Precise location
              </div>
              <div className="text-foreground/70">
                {result.precise_location.lat.toFixed(5)}, {result.precise_location.lon.toFixed(5)}
              </div>
              <a
                href={`https://www.google.com/maps?q=${result.precise_location.lat},${result.precise_location.lon}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Open in Maps
              </a>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <p className="mb-2 font-medium">Enter the verification code to see the exact location.</p>
              <p className="mb-3 text-xs text-foreground/50">
                Prototype note: no real SMS/OTP channel exists yet, so any code works here.
              </p>
              <div className="flex gap-2">
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Verification code"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={onRevealLocation}
                  disabled={revealing}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {revealing ? "Checking…" : "Verify"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense
        fallback={
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 pt-12 text-center">
            <p className="text-sm text-foreground/60">Loading…</p>
          </div>
        }
      >
        <VerifyPanel />
      </Suspense>
    </div>
  );
}
