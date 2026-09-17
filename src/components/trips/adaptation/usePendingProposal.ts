'use client';

import { useEffect, useRef } from 'react';
import { getTranslator } from '@/i18n/runtime';
import { announce } from '@/lib/ui/toast';
import type { AdaptationProposal } from '@/types/domain';

/**
 * The newest proposal awaiting review. A proposal that arrives while the page
 * is open is announced assertively; one already present on load is just content.
 */
export function usePendingProposal(proposals: AdaptationProposal[] | undefined): AdaptationProposal | null {
  const pending =
    proposals
      ?.filter((p) => p.status === 'proposed')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

  const loaded = useRef(false);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (proposals === undefined) return;
    if (!loaded.current) {
      loaded.current = true;
      lastId.current = pending?.proposalId ?? null;
      return;
    }
    if (pending && pending.proposalId !== lastId.current) {
      announce(getTranslator()('adaptation.banner.announce', { summary: pending.event?.summary ?? pending.summary }), 'assertive');
    }
    lastId.current = pending?.proposalId ?? null;
  }, [proposals, pending]);

  return pending;
}
