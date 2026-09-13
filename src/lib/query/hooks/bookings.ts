'use client';

import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Booking, BookingInput, BookingQuoteInput } from '@/types/domain';
import { queryKeys } from '../keys';

export function useBookings(tripId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bookings.list(tripId),
    queryFn: ({ signal }) => api.bookings.list({ tripId }, { signal }),
    enabled,
  });
}

export function useBooking(bookingId: string | null) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(bookingId ?? 'none'),
    queryFn: ({ signal }) => api.bookings.get(bookingId!, { signal }),
    enabled: Boolean(bookingId),
    // While the provider is confirming, poll as a fallback to realtime.
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 3000 : false),
  });
}

/** Stays, packages and cabs matched to the trip's current itinerary. */
export function useTripBookingRecommendations(tripId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.trips.bookingRecommendations(tripId),
    queryFn: ({ signal }) => api.bookings.recommendations(tripId, { signal }),
    enabled,
  });
}

export function useQuote() {
  return useMutation({ mutationFn: (input: BookingQuoteInput) => api.bookings.quote(input) });
}

function refreshAfterBookingChange(queryClient: QueryClient, booking: Booking) {
  queryClient.setQueryData(queryKeys.bookings.detail(booking.bookingId), booking);
  void queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] });
  // Booked status shows on the trip's itinerary and its recommendations.
  if (booking.tripId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bookingRecommendations(booking.tripId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.itinerary(booking.tripId), exact: true });
  }
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BookingInput) => api.bookings.create(input),
    onSuccess: (booking) => refreshAfterBookingChange(queryClient, booking),
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => api.bookings.cancel(bookingId),
    onSuccess: (booking) => refreshAfterBookingChange(queryClient, booking),
  });
}
