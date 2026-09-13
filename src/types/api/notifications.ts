import type { ID, ISODateTime } from './common';

export type NotificationCategory = 'safety' | 'trip' | 'message' | 'booking' | 'community';
export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export type NotificationTargetDto =
  | { kind: 'trip'; trip_id: ID }
  | { kind: 'adaptation'; trip_id: ID; proposal_id: ID }
  | { kind: 'conversation'; conversation_id: ID }
  | { kind: 'booking'; booking_id: ID }
  | { kind: 'sos'; alert_id: ID }
  | { kind: 'location_share'; share_id: ID }
  | { kind: 'destination'; slug: string };

export interface NotificationDto {
  notification_id: ID;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  created_at: ISODateTime;
  read_at: ISODateTime | null;
  target: NotificationTargetDto | null;
}
