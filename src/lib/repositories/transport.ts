import { endpoints } from '@/lib/api/endpoints';
import type {
  BookingQuoteDto,
  CabPlacesDto,
  CabSearchDto,
  MetroFareDto,
  MetroNetworkDto,
  MetroNetworkSummaryDto,
  TransportPlaceDto,
  TransportSearchResultDto,
} from '@/types/api';
import type {
  BookingQuote,
  CabOptionsQuery,
  CabPlaces,
  CabSearch,
  MetroFare,
  MetroFareQuery,
  MetroNetwork,
  MetroNetworkSummary,
  TransportPlace,
  TransportQuoteInput,
  TransportSearchQuery,
  TransportSearchResult,
} from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

/**
 * Getting there and around. Searches are public; quoting needs a session.
 * Fares, seats and journey times are decided by the backend — the frontend
 * never calls airline, bus, metro or cab systems itself.
 */
export interface TransportRepository {
  /** Cities and destinations with transport listed, and which modes each has. */
  places(options?: RequestOptions): Promise<TransportPlace[]>;
  /** Scheduled flight or bus departures (the backend's `GET /v1/services/search`). */
  search(query: TransportSearchQuery, options?: RequestOptions): Promise<TransportSearchResult[]>;
  metroNetworks(options?: RequestOptions): Promise<MetroNetworkSummary[]>;
  metroNetwork(networkId: string, options?: RequestOptions): Promise<MetroNetwork>;
  /** Fare, approximate time and interchanges between two stations. */
  metroFare(query: MetroFareQuery, options?: RequestOptions): Promise<MetroFare>;
  /** Suggested pickup and drop points for pre-booked cabs in a destination. */
  cabPlaces(destinationId: string, options?: RequestOptions): Promise<CabPlaces>;
  /** Estimated fares from verified local cab operators for a ride. */
  cabOptions(query: CabOptionsQuery, options?: RequestOptions): Promise<CabSearch>;
  /**
   * A priced, time-limited quote with `transport` details. Confirm it with
   * `api.bookings.create`, exactly like any other quote.
   */
  quote(input: TransportQuoteInput): Promise<BookingQuote>;
}

export function createTransportRepository(client: RepositoryClient): TransportRepository {
  return {
    places: async (options) => (await client.get<{ items: TransportPlaceDto[] }>(endpoints.transport.places, undefined, options)).items,
    search: async (query, options) =>
      (await client.get<{ items: TransportSearchResultDto[] }>(endpoints.transport.search, { ...query }, options)).items,
    metroNetworks: async (options) =>
      (await client.get<{ items: MetroNetworkSummaryDto[] }>(endpoints.transport.metroNetworks, undefined, options)).items,
    metroNetwork: (networkId, options) => client.get<MetroNetworkDto>(endpoints.transport.metroNetwork(networkId), undefined, options),
    metroFare: (query, options) => client.get<MetroFareDto>(endpoints.transport.metroFare, { ...query }, options),
    cabPlaces: (destinationId, options) => client.get<CabPlacesDto>(endpoints.transport.cabPlaces, { destinationId }, options),
    cabOptions: (query, options) => client.get<CabSearchDto>(endpoints.transport.cabOptions, { ...query }, options),
    quote: (input) => client.post<BookingQuoteDto>(endpoints.transport.quotes, input),
  };
}
