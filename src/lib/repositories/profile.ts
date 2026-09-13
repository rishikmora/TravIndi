import { endpoints } from '@/lib/api/endpoints';
import type { ConsentDto, DataRequestDto, HomeSummaryDto, ProfileDto } from '@/types/api';
import type { Consent, DataRequest, HomeSummary, Profile, ProfileUpdate } from '@/types/domain';
import type { RepositoryClient } from './client';

export interface ProfileRepository {
  get(): Promise<Profile>;
  update(patch: ProfileUpdate): Promise<Profile>;
  /** Personalised home data for a signed-in traveller. Never fabricated. */
  home(): Promise<HomeSummary>;
  consents(): Promise<Consent[]>;
  updateConsent(consentId: string, granted: boolean): Promise<Consent>;
  dataRequests(): Promise<DataRequest[]>;
  createDataRequest(kind: 'export' | 'deletion'): Promise<DataRequest>;
}

export function createProfileRepository(client: RepositoryClient): ProfileRepository {
  return {
    get: () => client.get<ProfileDto>(endpoints.me.profile),
    update: (patch) => client.patch<ProfileDto>(endpoints.me.profile, patch),
    home: () => client.get<HomeSummaryDto>(endpoints.me.home),
    consents: async () => (await client.get<{ items: ConsentDto[] }>(endpoints.me.consents)).items,
    updateConsent: (consentId, granted) => client.put<ConsentDto>(endpoints.me.consent(consentId), { granted }),
    dataRequests: async () => (await client.get<{ items: DataRequestDto[] }>(endpoints.me.dataRequests)).items,
    createDataRequest: (kind) => client.post<DataRequestDto>(endpoints.me.dataRequests, { kind }),
  };
}
