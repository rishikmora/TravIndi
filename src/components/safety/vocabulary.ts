import type { Tone } from '@/components/ui/StatusPill';
import { translatedLabels, withTranslations } from '@/i18n/vocabulary';
import type { HelpPointDto, IncidentCategory, IncidentDto, SafetyContextDto } from '@/types/api';

export const INCIDENT_CATEGORY = withTranslations<IncidentCategory, object>(
  { theft: {}, harassment: {}, scam: {}, accident: {}, medical: {}, lost_item: {}, unsafe_area: {}, other: {} },
  (category) => ({ label: `safety.incidentCategory.${category}.label`, description: `safety.incidentCategory.${category}.description` }),
);

export const INCIDENT_SEVERITY = withTranslations<IncidentDto['severity'], { tone: Tone }>(
  { low: { tone: 'neutral' }, moderate: { tone: 'warning' }, high: { tone: 'danger' }, critical: { tone: 'danger' } },
  (severity) => ({ label: `safety.severity.${severity}` }),
);

export const INCIDENT_STATUS = withTranslations<IncidentDto['status'], { tone: Tone }>(
  { reported: { tone: 'neutral' }, verified: { tone: 'info' }, resolved: { tone: 'success' }, dismissed: { tone: 'neutral' } },
  (status) => ({ label: `safety.incidentStatus.${status}` }),
);

export const SAFETY_LEVEL = withTranslations<SafetyContextDto['level'], { tone: Tone }>(
  { calm: { tone: 'success' }, caution: { tone: 'warning' }, elevated: { tone: 'danger' }, unknown: { tone: 'neutral' } },
  (level) => ({ label: `safety.level.${level}` }),
);

export const ADVISORY_SEVERITY = withTranslations<'info' | 'caution' | 'warning' | 'critical', { tone: Tone }>(
  { info: { tone: 'info' }, caution: { tone: 'warning' }, warning: { tone: 'danger' }, critical: { tone: 'danger' } },
  (severity) => ({ label: `safety.advisory.${severity}` }),
);

export const HELP_KIND: Record<HelpPointDto['kind'], string> = translatedLabels(
  ['police', 'hospital', 'tourist_help', 'embassy', 'pharmacy'] as const,
  (kind) => `safety.helpKind.${kind}`,
);
