"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders a real scannable QR code from a ticket's `qr_token` — the token
 * itself is what a real offline verifier (POST /api/v1/tickets/verify)
 * looks up, so this is a genuine ticket image, not a decorative mockup.
 */
export function QrTicket({ token, size = 168 }: { token: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(token, { width: size, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [token, size]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="Ticket QR code" width={size} height={size} className="rounded-lg" />
      ) : (
        <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-surface-muted" />
      )}
      <code className="max-w-full truncate text-xs text-foreground/50">{token}</code>
    </div>
  );
}
