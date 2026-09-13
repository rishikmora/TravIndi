import { endpoints } from '@/lib/api/endpoints';
import type { AcceptAdaptationResponseDto, AdaptationProposalDto, AdaptationStatus } from '@/types/api';
import type { AdaptationProposal, Itinerary, ReplanRequest } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface AdaptationRepository {
  listForTrip(tripId: string, status?: AdaptationStatus[], options?: RequestOptions): Promise<AdaptationProposal[]>;
  get(proposalId: string, options?: RequestOptions): Promise<AdaptationProposal>;
  /** The backend validates against `basedOnVersion` and applies atomically. */
  accept(
    proposalId: string,
    input: { basedOnVersion: number; alternativeId?: string | null },
  ): Promise<{ proposal: AdaptationProposal; itinerary: Itinerary }>;
  reject(proposalId: string, reason?: 'keep_current' | 'not_relevant' | 'other'): Promise<AdaptationProposal>;
  /** Manual replan requests produce a proposal that goes through the same review. */
  replan(tripId: string, input: ReplanRequest): Promise<AdaptationProposal>;
}

export function createAdaptationRepository(client: RepositoryClient): AdaptationRepository {
  return {
    listForTrip: async (tripId, status, options) =>
      (
        await client.get<{ items: AdaptationProposalDto[] }>(
          endpoints.adaptations.forTrip(tripId),
          { status: status?.join(',') },
          options,
        )
      ).items,
    get: (proposalId, options) =>
      client.get<AdaptationProposalDto>(endpoints.adaptations.detail(proposalId), undefined, options),
    accept: (proposalId, input) =>
      client.post<AcceptAdaptationResponseDto>(endpoints.adaptations.accept(proposalId), input, {
        idempotencyKey: `accept-${proposalId}-${input.basedOnVersion}`,
      }),
    reject: (proposalId, reason = 'keep_current') =>
      client.post<AdaptationProposalDto>(endpoints.adaptations.reject(proposalId), { reason }),
    replan: (tripId, input) => client.post<AdaptationProposalDto>(endpoints.adaptations.replan(tripId), input),
  };
}
