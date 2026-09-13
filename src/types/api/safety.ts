import type { FreshnessDto, GeoPointDto, ID, ISODateTime } from './common';
import type { AdvisoryDto, EmergencyNumberDto } from './destinations';

export interface HelpPointDto {
  help_point_id: ID;
  kind: 'police' | 'hospital' | 'tourist_help' | 'embassy' | 'pharmacy';
  name: string;
  coordinates: GeoPointDto;
  distance_meters: number | null;
  phone: string | null;
  open_now: boolean | null;
}

export interface SafetyContextDto {
  location_label: string | null;
  level: 'calm' | 'caution' | 'elevated' | 'unknown';
  summary: string;
  advisories: AdvisoryDto[];
  nearby_help: HelpPointDto[];
  emergency_numbers: EmergencyNumberDto[];
  freshness: FreshnessDto;
}

export type IncidentCategory = 'theft' | 'harassment' | 'scam' | 'accident' | 'medical' | 'lost_item' | 'unsafe_area' | 'other';

export interface IncidentDto {
  incident_id: ID;
  category: IncidentCategory;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  status: 'reported' | 'verified' | 'resolved' | 'dismissed';
  summary: string;
  location_label: string | null;
  coordinates: GeoPointDto | null;
  reported_at: ISODateTime;
  updated_at: ISODateTime;
  /** Reporter-only incidents are never shown to other travellers. */
  visibility: 'public' | 'reporter';
}

export interface IncidentReportRequestDto {
  client_report_id: string;
  category: IncidentCategory;
  description: string;
  coordinates: GeoPointDto | null;
  location_label: string | null;
  occurred_at: ISODateTime;
  anonymous: boolean;
  trip_id: ID | null;
}

export interface SosCreateRequestDto {
  /** Idempotency key generated on the device; safe to retry after reconnecting. */
  client_alert_id: string;
  trip_id: ID | null;
  coordinates: GeoPointDto | null;
  accuracy_meters: number | null;
  recorded_at: ISODateTime | null;
  /** When the alert was raised on the device (may precede server receipt when offline). */
  created_on_device_at: ISODateTime;
  message: string | null;
  notify_trusted_contacts: boolean;
}

export interface SosNotificationDto {
  channel: 'trusted_contact' | 'authority' | 'travindi_team';
  recipient_label: string;
  /** `not_supported` means the channel is not integrated — say so, never imply delivery. */
  status: 'queued' | 'delivered' | 'failed' | 'not_supported';
  updated_at: ISODateTime;
}

export interface SosAlertDto {
  alert_id: ID;
  client_alert_id: string;
  status: 'received' | 'acknowledged' | 'responding' | 'resolved' | 'cancelled';
  received_at: ISODateTime;
  acknowledged_at: ISODateTime | null;
  resolved_at: ISODateTime | null;
  acknowledged_by_label: string | null;
  notifications: SosNotificationDto[];
  guidance: string[];
}

export interface TrustedContactDto {
  contact_id: ID;
  name: string;
  relationship: string;
  phone_masked: string | null;
  email_masked: string | null;
  verified: boolean;
  notify_on: Array<'sos' | 'missed_check_in' | 'location_share'>;
}

export interface TrustedContactInputDto {
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  notify_on: Array<'sos' | 'missed_check_in' | 'location_share'>;
}

export interface CheckInDto {
  check_in_id: ID;
  trip_id: ID | null;
  due_at: ISODateTime;
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled';
  completed_at: ISODateTime | null;
  note: string | null;
}
