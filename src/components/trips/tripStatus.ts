import type { Tone } from '@/components/ui/StatusPill';
import type { TripStatus } from '@/types/api';

export const TRIP_STATUS: Record<TripStatus, { label: string; tone: Tone; description: string }> = {
  draft: { label: 'Draft', tone: 'neutral', description: 'Details saved; no itinerary yet.' },
  planning: { label: 'Planning', tone: 'info', description: 'Your itinerary is being built.' },
  ready: { label: 'Ready', tone: 'success', description: 'Itinerary ready to travel.' },
  active: { label: 'On the road', tone: 'accent', description: 'You’re travelling now.' },
  completed: { label: 'Completed', tone: 'neutral', description: 'Trip finished.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', description: 'Trip cancelled.' },
};
