import type { BookingQuoteDto } from '@/types/api';
import { metroNetworkById } from '../catalog/transport';
import { dateOffset } from '../http';
import { buildDepartureQuote, buildMetroFare, buildMetroQuote, departuresOn, istDate, planMetroJourney, seatsLeft } from '../logic/transport';
import type { MockState } from '../store';
import { minutesAgo, T, U } from './ids';

type BookingRecord = MockState['bookings'][number];

function fromQuote(quote: BookingQuoteDto, init: Pick<BookingRecord, 'booking_id' | 'status' | 'confirmation_code' | 'ticket' | 'created_at'>): BookingRecord {
  return {
    ...init,
    client_booking_id: `seed-${init.booking_id}`,
    trip_id: T.hyderabad,
    service_id: quote.service.service_id,
    service_name: quote.service.name,
    unit: quote.service.unit,
    provider: quote.provider,
    date: quote.date,
    time_slot: quote.time_slot,
    quantity: quote.quantity,
    nights: quote.nights,
    price: quote.price,
    failure_reason: null,
    updated_at: init.created_at,
    transport: quote.transport ?? null,
    _owner_id: U.ananya,
    _contact_name: 'Ananya Rao',
  };
}

/**
 * Sample transport bookings on the demo family's Hyderabad trip: metro tickets
 * for today and the flight home to Bengaluru, still awaiting payment.
 */
export function seedTransportBookings(): BookingRecord[] {
  const nowMs = Date.now();
  const bookings: BookingRecord[] = [];

  const metro = metroNetworkById('metro_hyderabad');
  const journey = metro ? planMetroJourney(metro, 'assembly', 'hitec-city') : null;
  if (metro && journey) {
    const fare = buildMetroFare(metro, journey, 'assembly', 'hitec-city', 2, nowMs);
    const quote = buildMetroQuote(metro, fare, istDate(nowMs), 'qte_seed_metro', nowMs);
    const code = 'TVD-M8TR0H';
    bookings.push(
      fromQuote(quote, {
        booking_id: 'bkg_hyd_metro',
        status: 'confirmed',
        confirmation_code: code,
        ticket: {
          ticket_id: 'tkt_bkg_hyd_metro',
          booking_id: 'bkg_hyd_metro',
          code,
          issued_at: minutesAgo(90),
          valid_from: null,
          valid_until: null,
          qr_payload: `travindi:ticket:bkg_hyd_metro:${code}`,
        },
        created_at: minutesAgo(95),
      }),
    );
  }

  // The trip ends in two days; the family flies home in the evening.
  const flightDate = dateOffset(2);
  const flights = departuresOn('flight', 'hyderabad', 'bengaluru', flightDate, istDate(nowMs));
  const flight = flights.find((d) => d.time >= '16:00') ?? flights[flights.length - 1];
  if (flight && seatsLeft(flight, []) >= 4) {
    const quote = buildDepartureQuote(flight, 4, seatsLeft(flight, []), 'qte_seed_flight', nowMs);
    bookings.push(
      fromQuote(quote, { booking_id: 'bkg_hyd_flight_home', status: 'payment_pending', confirmation_code: null, ticket: null, created_at: minutesAgo(2 * 1440) }),
    );
  }
  return bookings;
}
