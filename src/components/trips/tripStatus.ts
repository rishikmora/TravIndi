import type { Tone } from '@/components/ui/StatusPill';
import { withTranslations } from '@/i18n/vocabulary';
import type { TripStatus } from '@/types/api';

export const TRIP_STATUS = withTranslations<TripStatus, { tone: Tone }>(
  {
    draft: { tone: 'neutral' },
    planning: { tone: 'info' },
    ready: { tone: 'success' },
    active: { tone: 'accent' },
    completed: { tone: 'neutral' },
    cancelled: { tone: 'neutral' },
  },
  (status) => ({ label: `trips.status.${status}.label`, description: `trips.status.${status}.description` }),
);
