"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isApiError } from "@/lib/auth-context";
import { api } from "@/lib/api";

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
      <div className="mx-auto max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold">Invalid link</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          This trusted-contact link is missing its SOS id or token.
        </p>
      </div>
    );
  }

  if (loading) return <p className="text-sm text-black/60 dark:text-white/60">Checking…</p>;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-2xl font-semibold">Someone you know may need help</h1>
      <p className="mb-6 text-sm text-black/60 dark:text-white/60">
        You&apos;re seeing this because you&apos;re registered as a trusted contact — no account needed.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-red-500/40 bg-red-500/5 p-4 text-sm">
            <div className="mb-1 uppercase tracking-wide text-red-600">{result.status}</div>
            <div>Type: {result.emergency_type ?? "General"}</div>
            <div className="text-black/60 dark:text-white/60">
              Triggered {new Date(result.created_at).toLocaleString()}
            </div>
          </div>

          {result.precise_location ? (
            <div className="rounded border border-black/10 p-4 text-sm dark:border-white/15">
              <div className="mb-1 font-medium">Precise location</div>
              <div>
                {result.precise_location.lat.toFixed(5)}, {result.precise_location.lon.toFixed(5)}
              </div>
              <a
                href={`https://www.google.com/maps?q=${result.precise_location.lat},${result.precise_location.lon}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block underline"
              >
                Open in maps
              </a>
            </div>
          ) : (
            <div className="rounded border border-black/10 p-4 text-sm dark:border-white/15">
              <p className="mb-2">Enter the verification code to see the exact location.</p>
              <p className="mb-3 text-xs text-black/50 dark:text-white/50">
                Prototype note: no real SMS/OTP channel exists yet, so any code works here.
              </p>
              <div className="flex gap-2">
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Verification code"
                  className="flex-1 rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
                />
                <button
                  onClick={onRevealLocation}
                  disabled={revealing}
                  className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
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
    <Suspense fallback={<p className="text-sm text-black/60 dark:text-white/60">Loading…</p>}>
      <VerifyPanel />
    </Suspense>
  );
}
