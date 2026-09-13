import type { Tone } from '@/components/ui/StatusPill';
import type { HelpPointDto, IncidentCategory, IncidentDto, SafetyContextDto } from '@/types/api';

export const INCIDENT_CATEGORY: Record<IncidentCategory, { label: string; description: string }> = {
  theft: { label: 'Theft', description: 'Something was stolen, or someone tried.' },
  harassment: { label: 'Harassment', description: 'Unwanted attention, following or threats.' },
  scam: { label: 'Scam or overcharging', description: 'Fake services, tricks or unfair prices.' },
  accident: { label: 'Accident', description: 'A road, transport or other accident.' },
  medical: { label: 'Medical', description: 'Someone was unwell or injured.' },
  lost_item: { label: 'Lost item', description: 'You lost something and want it on record.' },
  unsafe_area: { label: 'Unsafe place', description: 'Poor lighting, hazards or a place that felt unsafe.' },
  other: { label: 'Something else', description: 'Anything that doesn’t fit above.' },
};

export const INCIDENT_SEVERITY: Record<IncidentDto['severity'], { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'neutral' },
  moderate: { label: 'Moderate', tone: 'warning' },
  high: { label: 'High', tone: 'danger' },
  critical: { label: 'Critical', tone: 'danger' },
};

export const INCIDENT_STATUS: Record<IncidentDto['status'], { label: string; tone: Tone }> = {
  reported: { label: 'Reported', tone: 'neutral' },
  verified: { label: 'Verified', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
};

export const SAFETY_LEVEL: Record<SafetyContextDto['level'], { label: string; tone: Tone }> = {
  calm: { label: 'Calm', tone: 'success' },
  caution: { label: 'Caution', tone: 'warning' },
  elevated: { label: 'Elevated', tone: 'danger' },
  unknown: { label: 'No data', tone: 'neutral' },
};

export const ADVISORY_SEVERITY: Record<'info' | 'caution' | 'warning' | 'critical', { label: string; tone: Tone }> = {
  info: { label: 'Info', tone: 'info' },
  caution: { label: 'Caution', tone: 'warning' },
  warning: { label: 'Warning', tone: 'danger' },
  critical: { label: 'Critical', tone: 'danger' },
};

export const HELP_KIND: Record<HelpPointDto['kind'], string> = {
  police: 'Police',
  hospital: 'Hospital',
  tourist_help: 'Tourist help',
  embassy: 'Embassy',
  pharmacy: 'Pharmacy',
};
