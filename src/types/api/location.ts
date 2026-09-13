import type { ID, ISODateTime } from './common';

export type LocationShareStatus = 'active' | 'paused' | 'expired' | 'stopped' | 'revoked';

export interface LocationUpdateDto {
  latitude: number;
  longitude: number;
  /** Metres, 68% confidence radius as reported by the device. */
  accuracy: number | null;
  recorded_at: ISODateTime;
  /** Monotonic per share; lets clients drop out-of-order updates. */
  sequence: number;
}

export interface LocationRecipientDto {
  recipient_id: ID;
  display_name: string;
  kind: 'user' | 'trip' | 'trusted_contact';
}

export interface LocationShareDto {
  share_id: ID;
  owner_id: ID;
  owner_name: string;
  trip_id: ID | null;
  recipient_ids: ID[];
  recipients: LocationRecipientDto[];
  /** Human summary of the audience, e.g. "Family Trip". */
  audience_label: string;
  started_at: ISODateTime;
  expires_at: ISODateTime | null;
  status: LocationShareStatus;
  precision_mode: 'precise' | 'approximate';
  last_location_at: ISODateTime | null;
  last_location: LocationUpdateDto | null;
}

export interface CreateLocationShareRequestDto {
  trip_id: ID | null;
  audience: 'trip_members' | 'trusted_contacts' | 'custom';
  recipient_ids: ID[];
  duration_minutes: number;
  precision_mode: 'precise' | 'approximate';
}

export interface UpdateLocationShareRequestDto {
  status?: 'active' | 'paused';
  extend_minutes?: number;
  recipient_ids?: ID[];
}

export interface PostLocationUpdatesRequestDto {
  updates: LocationUpdateDto[];
}

export interface LocationShareHistoryItemDto {
  share_id: ID;
  audience_label: string;
  started_at: ISODateTime;
  ended_at: ISODateTime | null;
  status: LocationShareStatus;
}
