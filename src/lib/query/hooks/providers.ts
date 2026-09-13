'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProviderListQuery } from '@/lib/repositories/providers';
import type { FraudReportInput } from '@/types/domain';
import { queryKeys } from '../keys';

export function useBusinesses(params: ProviderListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.businesses.list({ ...params }),
    queryFn: ({ signal }) => api.businesses.list(params, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useBusiness(id: string) {
  return useQuery({ queryKey: queryKeys.businesses.detail(id), queryFn: ({ signal }) => api.businesses.get(id, { signal }) });
}

export function useBusinessReviews(id: string) {
  return useQuery({ queryKey: queryKeys.businesses.reviews(id), queryFn: () => api.businesses.reviews(id) });
}

export function useGuides(params: ProviderListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.guides.list({ ...params }),
    queryFn: ({ signal }) => api.guides.list(params, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useGuide(id: string) {
  return useQuery({ queryKey: queryKeys.guides.detail(id), queryFn: ({ signal }) => api.guides.get(id, { signal }) });
}

export function useGuideReviews(id: string) {
  return useQuery({ queryKey: queryKeys.guides.reviews(id), queryFn: () => api.guides.reviews(id) });
}

/** Runs only for a submitted query (not on every keystroke). */
export function useTrustLookup(q: string | null) {
  return useQuery({
    queryKey: queryKeys.trust.lookup(q ?? ''),
    queryFn: () => api.trust.lookup(q!),
    enabled: Boolean(q && q.length >= 3),
    retry: false,
  });
}

export function useReportFraud() {
  return useMutation({ mutationFn: (input: FraudReportInput) => api.trust.reportFraud(input) });
}
