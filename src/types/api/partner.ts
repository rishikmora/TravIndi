import type { ID, ISODate, ISODateTime } from './common';
import type { BookingDto } from './booking';
import type { ReviewDto, ServiceDto, VerificationEvidenceDto } from './providers';

export type KycStatus = 'not_started' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'needs_info';

export interface PartnerProfileDto {
  provider_id: ID;
  provider_type: 'business' | 'guide';
  name: string;
  description: string;
  languages: string[];
  kyc_status: KycStatus;
  kyc_note: string | null;
  verification: VerificationEvidenceDto[];
  services: ServiceDto[];
  updated_at: ISODateTime;
}

export interface AvailabilitySlotDto {
  slot_id: ID;
  service_id: ID;
  date: ISODate;
  time_slot: string;
  capacity: number;
  booked: number;
  status: 'open' | 'closed';
}

export interface ComplaintDto {
  complaint_id: ID;
  booking_id: ID | null;
  category: string;
  summary: string;
  status: 'open' | 'responded' | 'resolved' | 'escalated';
  created_at: ISODateTime;
}

export interface PartnerDashboardDto {
  profile: PartnerProfileDto;
  upcoming_bookings: BookingDto[];
  recent_reviews: ReviewDto[];
  open_complaints: ComplaintDto[];
  availability: AvailabilitySlotDto[];
}
