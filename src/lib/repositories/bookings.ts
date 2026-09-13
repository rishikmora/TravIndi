import { endpoints } from '@/lib/api/endpoints';
import type { BookingDto, BookingQuoteDto, TripBookingRecommendationsDto } from '@/types/api';
import type { Booking, BookingInput, BookingQuote, BookingQuoteInput, TripBookingRecommendations } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface BookingRepository {
  list(input?: { tripId?: string | null }, options?: RequestOptions): Promise<Booking[]>;
  get(bookingId: string, options?: RequestOptions): Promise<Booking>;
  /** Availability and price are decided by the backend at quote time. */
  quote(input: BookingQuoteInput): Promise<BookingQuote>;
  /** Idempotent on `clientBookingId`. The UI shows "confirmed" only from the response. */
  create(input: BookingInput): Promise<Booking>;
  cancel(bookingId: string): Promise<Booking>;
  /** Stays, packages and cabs the backend matches to a trip's current itinerary. */
  recommendations(tripId: string, options?: RequestOptions): Promise<TripBookingRecommendations>;
}

export function createBookingRepository(client: RepositoryClient): BookingRepository {
  return {
    list: async (input, options) =>
      (
        await client.get<{ items: BookingDto[] }>(
          endpoints.bookings.list,
          { tripId: input?.tripId ?? undefined },
          options,
        )
      ).items,
    get: (bookingId, options) => client.get<BookingDto>(endpoints.bookings.detail(bookingId), undefined, options),
    quote: (input) => client.post<BookingQuoteDto>(endpoints.bookings.quotes, input),
    create: (input) =>
      client.post<BookingDto>(endpoints.bookings.create, input, { idempotencyKey: input.clientBookingId }),
    cancel: (bookingId) => client.post<BookingDto>(endpoints.bookings.cancel(bookingId)),
    recommendations: (tripId, options) =>
      client.get<TripBookingRecommendationsDto>(endpoints.trips.bookingRecommendations(tripId), undefined, options),
  };
}
