'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { camelizeKeys, snakeizeKeys } from '@/lib/api/case';
import { resolveCapabilities } from '@/lib/config/features';
import { queryKeys } from '@/lib/query/keys';
import type { CapabilitiesDto } from '@/types/api';
import type { Capabilities } from '@/types/domain';

/**
 * What the connected backend can actually do, with environment overrides
 * applied. Until the backend answers, every capability is treated as off.
 */
export function useCapabilities(): { capabilities: Capabilities; known: boolean } {
  const query = useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: () => api.platform.capabilities(),
    staleTime: 10 * 60_000,
  });

  const capabilities = useMemo(
    () => camelizeKeys(resolveCapabilities(query.data ? (snakeizeKeys(query.data) as unknown as CapabilitiesDto) : null)) as Capabilities,
    [query.data],
  );

  return { capabilities, known: query.isSuccess };
}
