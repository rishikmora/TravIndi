import type { Tone } from '@/components/ui/StatusPill';
import type { BookingStatus, ServiceUnit } from '@/types/api';

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone; description: string }> = {
  processing: { label: 'Processing', tone: 'info', description: 'Waiting for the provider to confirm.' },
  confirmed: { label: 'Confirmed', tone: 'success', description: 'The provider confirmed this booking.' },
  payment_pending: { label: 'Payment pending', tone: 'warning', description: 'Pay the provider directly. Online payment isn’t available in TravIndi yet.' },
  failed: { label: 'Failed', tone: 'danger', description: 'This booking couldn’t be completed. No payment was taken.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', description: 'This booking was cancelled.' },
};

/** What a listed price covers, shown beside it. */
export const UNIT_PRICE_LABEL: Record<ServiceUnit, string> = {
  person: 'per person',
  room_night: 'per room, per night',
  vehicle: 'per vehicle',
  group: 'per booking',
};

/** The quantity stepper's label for each unit. */
export const UNIT_QUANTITY_LABEL: Record<ServiceUnit, string> = {
  person: 'Travellers',
  room_night: 'Rooms',
  vehicle: 'Vehicles',
  group: 'Group size',
};

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 rooms · 3 nights", "1 vehicle", "4 people", "Group of 5". */
export function quantityLabel(unit: ServiceUnit, quantity: number, nights: number | null) {
  switch (unit) {
    case 'room_night':
      return [count(quantity, 'room'), nights ? count(nights, 'night') : null].filter(Boolean).join(' · ');
    case 'vehicle':
      return count(quantity, 'vehicle');
    case 'person':
      return count(quantity, 'person', 'people');
    default:
      return `Group of ${quantity}`;
  }
}
