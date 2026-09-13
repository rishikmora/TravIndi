import type { FreshnessDto, GeoPointDto, ID, ISODateTime } from './common';
import type { IncidentDto } from './safety';

export interface AuthorityOverviewDto {
  open_sos: number;
  critical_incidents: number;
  pending_verifications: number;
  active_advisories: number;
  freshness: FreshnessDto;
}

export interface AuthoritySosItemDto {
  alert_id: ID;
  status: 'received' | 'acknowledged' | 'responding' | 'resolved' | 'cancelled';
  priority: 'critical' | 'high' | 'normal';
  traveller_label: string;
  coordinates: GeoPointDto | null;
  accuracy_meters: number | null;
  location_label: string | null;
  received_at: ISODateTime;
  last_update_at: ISODateTime;
  assigned_to_label: string | null;
}

export type AuthoritySosAction = 'acknowledge' | 'mark_responding' | 'resolve';

export interface AuthorityIncidentDto extends IncidentDto {
  reporter_count: number;
  assigned_unit_label: string | null;
}

export type AuthorityIncidentAction = 'verify' | 'resolve' | 'dismiss';

export interface VerificationDocumentDto {
  document_id: ID;
  kind: 'identity' | 'business_registration' | 'guide_licence' | 'address_proof' | 'other';
  status: 'received' | 'accepted' | 'rejected';
  uploaded_at: ISODateTime;
}

export interface VerificationRequestDto {
  request_id: ID;
  subject_type: 'business' | 'guide';
  subject_id: ID;
  subject_name: string;
  destination_name: string | null;
  submitted_at: ISODateTime;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_info';
  documents: VerificationDocumentDto[];
  /** Automated checks worth a reviewer's attention; not decisions. */
  review_flags: string[];
}

export interface VerificationDecisionRequestDto {
  decision: 'approve' | 'reject' | 'request_info';
  note: string;
}

export interface AnalyticsSeriesDto {
  metric: 'sos_alerts' | 'incident_reports' | 'active_trips' | 'verifications_completed';
  label: string;
  unit: string;
  points: Array<{ t: ISODateTime; value: number }>;
  freshness: FreshnessDto;
}

export interface AuthorityAnalyticsDto {
  range: '24h' | '7d' | '30d';
  series: AnalyticsSeriesDto[];
  incidents_by_category: Array<{ category: string; count: number }>;
}
