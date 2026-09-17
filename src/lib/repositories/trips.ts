import { endpoints } from '@/lib/api/endpoints';
import { journeyContext, requestLocaleTag } from '@/lib/api/language';
import type { GenerationJobDto, IntentExtractionDto, PageDto, TripDto, TripSummaryDto } from '@/types/api';
import type { GenerationJob, IntentExtraction, Trip, TripIntent, TripSummary } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface ExtractIntentInput {
  text: string;
  locale?: string;
  useProfileDefaults?: boolean;
  currentIntent?: TripIntent | null;
}

export interface TripRepository {
  list(options?: RequestOptions): Promise<TripSummary[]>;
  get(tripId: string, options?: RequestOptions): Promise<Trip>;
  create(input: { intent: TripIntent; title?: string | null }, options?: RequestOptions): Promise<Trip>;
  update(
    tripId: string,
    patch: { title?: string; intent?: TripIntent; basedOnUpdatedAt?: string },
  ): Promise<Trip>;
  /** Natural language → structured, editable intent. AI runs on the backend only. */
  extractIntent(input: ExtractIntentInput, options?: RequestOptions): Promise<IntentExtraction>;
  generateItinerary(tripId: string, options?: RequestOptions): Promise<GenerationJob>;
  generationJob(jobId: string, options?: RequestOptions): Promise<GenerationJob>;
}

export function createTripRepository(client: RepositoryClient): TripRepository {
  return {
    list: async (options) => (await client.get<PageDto<TripSummaryDto>>(endpoints.trips.list, undefined, options)).items,
    get: (tripId, options) => client.get<TripDto>(endpoints.trips.detail(tripId), undefined, options),
    create: (input, options) => client.post<TripDto>(endpoints.trips.create, { ...input, ...journeyContext() }, options),
    update: (tripId, patch) => client.patch<TripDto>(endpoints.trips.detail(tripId), patch),
    extractIntent: (input, options) =>
      client.post<IntentExtractionDto>(
        endpoints.trips.extractIntent,
        { locale: requestLocaleTag(), ...input, ...journeyContext() },
        options,
      ),
    generateItinerary: (tripId, options) =>
      client.post<GenerationJobDto>(endpoints.trips.generate(tripId), journeyContext(), options),
    generationJob: (jobId, options) => client.get<GenerationJobDto>(endpoints.trips.generationJob(jobId), undefined, options),
  };
}
