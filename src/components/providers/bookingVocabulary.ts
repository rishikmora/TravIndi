import type { Tone } from '@/components/ui/StatusPill';
import { translate } from '@/i18n/runtime';
import type { BookingStatus, ServiceUnit } from '@/types/api';

const status = (key: BookingStatus, tone: Tone) => ({
  get label() {
    return translate(`bookings.status.${key}.label`);
  },
  get description() {
    return translate(`bookings.status.${key}.description`);
  },
  tone,
});

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone; description: string }> = {
  processing: status('processing', 'info'),
  confirmed: status('confirmed', 'success'),
  payment_pending: status('payment_pending', 'warning'),
  failed: status('failed', 'danger'),
  cancelled: status('cancelled', 'neutral'),
};

/** What a listed price covers, shown beside it. */
export const UNIT_PRICE_LABEL: Record<ServiceUnit, string> = {
  get person() {
    return translate('bookings.unitPrice.person');
  },
  get room_night() {
    return translate('bookings.unitPrice.room_night');
  },
  get vehicle() {
    return translate('bookings.unitPrice.vehicle');
  },
  get group() {
    return translate('bookings.unitPrice.group');
  },
};

/** The quantity stepper's label for each unit. */
export const UNIT_QUANTITY_LABEL: Record<ServiceUnit, string> = {
  get person() {
    return translate('bookings.unitQuantity.person');
  },
  get room_night() {
    return translate('bookings.unitQuantity.room_night');
  },
  get vehicle() {
    return translate('bookings.unitQuantity.vehicle');
  },
  get group() {
    return translate('bookings.unitQuantity.group');
  },
};

/** "2 rooms · 3 nights", "1 vehicle", "4 people", "Group of 5". */
export function quantityLabel(unit: ServiceUnit, quantity: number, nights: number | null) {
  switch (unit) {
    case 'room_night':
      return [translate('bookings.quantity.rooms', { count: quantity }), nights ? translate('bookings.quantity.nights', { count: nights }) : null]
        .filter(Boolean)
        .join(' · ');
    case 'vehicle':
      return translate('bookings.quantity.vehicles', { count: quantity });
    case 'person':
      return translate('bookings.quantity.people', { count: quantity });
    default:
      return translate('bookings.quantity.group', { count: quantity });
  }
}
