import { endpoints } from '@/lib/api/endpoints';
import type {
  BusinessCategory,
  BusinessDto,
  FraudReportDto,
  GuideDto,
  PageDto,
  ReviewDto,
  VerificationLookupDto,
} from '@/types/api';
import type {
  Business,
  FraudReport,
  FraudReportInput,
  Guide,
  Page,
  Review,
  VerificationLookup,
} from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface ProviderListQuery {
  destinationId?: string;
  category?: BusinessCategory;
  language?: string;
  verifiedOnly?: boolean;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface BusinessRepository {
  list(query?: ProviderListQuery, options?: RequestOptions): Promise<Page<Business>>;
  get(businessId: string, options?: RequestOptions): Promise<Business>;
  reviews(businessId: string, cursor?: string): Promise<Page<Review>>;
}

export interface GuideRepository {
  list(query?: ProviderListQuery, options?: RequestOptions): Promise<Page<Guide>>;
  get(guideId: string, options?: RequestOptions): Promise<Guide>;
  reviews(guideId: string, cursor?: string): Promise<Page<Review>>;
}

export interface TrustRepository {
  /** Look up a provider name/ID or a ticket code and return the evidence the backend holds. */
  lookup(query: string): Promise<VerificationLookup>;
  reportFraud(input: FraudReportInput): Promise<FraudReport>;
}

export function createBusinessRepository(client: RepositoryClient): BusinessRepository {
  return {
    list: (query, options) => client.get<PageDto<BusinessDto>>(endpoints.businesses.list, { ...query }, options),
    get: (businessId, options) => client.get<BusinessDto>(endpoints.businesses.detail(businessId), undefined, options),
    reviews: (businessId, cursor) => client.get<PageDto<ReviewDto>>(endpoints.businesses.reviews(businessId), { cursor }),
  };
}

export function createGuideRepository(client: RepositoryClient): GuideRepository {
  return {
    list: (query, options) => client.get<PageDto<GuideDto>>(endpoints.guides.list, { ...query }, options),
    get: (guideId, options) => client.get<GuideDto>(endpoints.guides.detail(guideId), undefined, options),
    reviews: (guideId, cursor) => client.get<PageDto<ReviewDto>>(endpoints.guides.reviews(guideId), { cursor }),
  };
}

export function createTrustRepository(client: RepositoryClient): TrustRepository {
  return {
    lookup: (query) => client.get<VerificationLookupDto>(endpoints.trust.lookup, { q: query }),
    reportFraud: (input) =>
      client.post<FraudReportDto>(endpoints.trust.fraudReports, input, { idempotencyKey: input.clientReportId }),
  };
}
