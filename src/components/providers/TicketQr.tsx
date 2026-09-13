'use client';

import { useMemo } from 'react';
import { renderSVG } from 'uqr';
import type { Ticket } from '@/types/domain';

/** Renders the backend's opaque ticket payload as a QR code; the payload itself is never interpreted. */
export function TicketQr({ ticket }: { ticket: Ticket }) {
  const svg = useMemo(() => renderSVG(ticket.qrPayload, { border: 1 }), [ticket.qrPayload]);
  return (
    <figure className="grid justify-items-center gap-2">
      <div role="img" aria-label={`QR code for ticket ${ticket.code}`} className="size-48 rounded-2xl bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="text-center">
        <span className="label block text-[var(--text-subtle)]">Ticket code</span>
        <span className="font-mono text-[1.125rem] font-semibold tracking-[0.08em]">{ticket.code}</span>
      </figcaption>
    </figure>
  );
}
