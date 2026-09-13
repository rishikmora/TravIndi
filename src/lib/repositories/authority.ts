import { endpoints } from '@/lib/api/endpoints';
import type {
  AuthorityAnalyticsDto,
  AuthorityIncidentAction,
  AuthorityIncidentDto,
  AuthorityOverviewDto,
  AuthoritySosAction,
  AuthoritySosItemDto,
  VerificationRequestDto,
} from '@/types/api';
import type {
  AuthorityAnalytics,
  AuthorityIncident,
  AuthorityOverview,
  AuthoritySosItem,
  VerificationRequest,
} from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

/**
 * Operational interface for authorities. Every state transition is decided and
 * audited by the backend; the UI renders only what the response confirms.
 */
export interface AuthorityRepository {
  overview(options?: RequestOptions): Promise<AuthorityOverview>;
  sosQueue(input?: { status?: string[] }, options?: RequestOptions): Promise<AuthoritySosItem[]>;
  sosAction(alertId: string, action: AuthoritySosAction, note?: string): Promise<AuthoritySosItem>;
  incidents(
    input?: { severity?: string[]; status?: string[]; since?: string },
    options?: RequestOptions,
  ): Promise<AuthorityIncident[]>;
  incidentAction(incidentId: string, action: AuthorityIncidentAction, note?: string): Promise<AuthorityIncident>;
  verifications(input?: { status?: string[] }, options?: RequestOptions): Promise<VerificationRequest[]>;
  decideVerification(
    requestId: string,
    input: { decision: 'approve' | 'reject' | 'request_info'; note: string },
  ): Promise<VerificationRequest>;
  analytics(range: '24h' | '7d' | '30d', options?: RequestOptions): Promise<AuthorityAnalytics>;
}

export function createAuthorityRepository(client: RepositoryClient): AuthorityRepository {
  return {
    overview: (options) => client.get<AuthorityOverviewDto>(endpoints.authority.overview, undefined, options),
    sosQueue: async (input, options) =>
      (
        await client.get<{ items: AuthoritySosItemDto[] }>(
          endpoints.authority.sos,
          { status: input?.status?.join(',') },
          options,
        )
      ).items,
    sosAction: (alertId, action, note) =>
      client.post<AuthoritySosItemDto>(endpoints.authority.sosAction(alertId), { action, note: note ?? null }),
    incidents: async (input, options) =>
      (
        await client.get<{ items: AuthorityIncidentDto[] }>(
          endpoints.authority.incidents,
          { severity: input?.severity?.join(','), status: input?.status?.join(','), since: input?.since },
          options,
        )
      ).items,
    incidentAction: (incidentId, action, note) =>
      client.post<AuthorityIncidentDto>(endpoints.authority.incidentAction(incidentId), { action, note: note ?? null }),
    verifications: async (input, options) =>
      (
        await client.get<{ items: VerificationRequestDto[] }>(
          endpoints.authority.verifications,
          { status: input?.status?.join(',') },
          options,
        )
      ).items,
    decideVerification: (requestId, input) =>
      client.post<VerificationRequestDto>(endpoints.authority.verificationDecision(requestId), input),
    analytics: (range, options) => client.get<AuthorityAnalyticsDto>(endpoints.authority.analytics, { range }, options),
  };
}
