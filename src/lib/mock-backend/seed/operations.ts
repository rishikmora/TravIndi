import type {
  AdvisoryDto,
  AvailabilitySlotDto,
  BookingDto,
  CrowdSignalDto,
  PartnerProfileDto,
  SosNotificationDto,
  VerificationRequestDto,
} from '@/types/api';
import { BUSINESSES, findBusiness, findGuide, GUIDES } from '../catalog/providers';
import { dateOffset } from '../http';
import type { CheckInRecord, IncidentRecord, MockState, SosRecord } from '../store';
import { atLocal, minutesAgo, minutesAhead, T, U } from './ids';

const SAMPLE = 'sample data';

export const SOS_GUIDANCE = [
  'If you are in immediate danger, call 112.',
  'Move to a well-lit public place if you can.',
  'Keep your phone on and with you.',
];

export function seedAdvisories(): Record<string, AdvisoryDto[]> {
  return {
    hyderabad: [
      {
        advisory_id: 'adv_hyd_charminar',
        severity: 'caution',
        title: 'Busy evenings around Charminar',
        body: 'Expect heavy footfall in the old city on weekend evenings. Keep valuables secure and agree a meeting point with your group.',
        source_label: `TravIndi safety team (${SAMPLE})`,
        issued_at: minutesAgo(180),
        expires_at: minutesAhead(3 * 1440),
      },
    ],
  };
}

export function seedCrowdReports(): CrowdSignalDto[] {
  return [
    {
      signal_id: 'crd_charminar',
      coordinates: { lat: 17.3616, lng: 78.4747 },
      level: 'moderate',
      label: 'Visitors report steady crowds',
      freshness: { source_kind: 'application', updated_at: minutesAgo(18), stale_after_seconds: 3600, source_label: `Visitor reports (${SAMPLE})` },
    },
  ];
}

const incident = (init: Omit<IncidentRecord, '_client_report_id'>): IncidentRecord => ({ ...init, _client_report_id: null });

export function seedIncidents(): IncidentRecord[] {
  return [
    incident({
      incident_id: 'inc_laad_theft',
      category: 'theft',
      severity: 'moderate',
      status: 'verified',
      summary: 'Pickpocketing reported in crowded market lanes.',
      location_label: 'Laad Bazaar',
      coordinates: { lat: 17.3609, lng: 78.4732 },
      reported_at: minutesAgo(2 * 1440),
      updated_at: minutesAgo(1440),
      visibility: 'public',
      _reporter_id: 'usr_traveller_other',
      _reporter_count: 3,
      _assigned_unit_label: 'Old City patrol (demo)',
    }),
    incident({
      incident_id: 'inc_station_scam',
      category: 'scam',
      severity: 'low',
      status: 'verified',
      summary: 'Overcharging by unmetered autos reported outside the railway station.',
      location_label: 'Secunderabad station area',
      coordinates: { lat: 17.4337, lng: 78.5016 },
      reported_at: minutesAgo(6 * 60),
      updated_at: minutesAgo(4 * 60),
      visibility: 'public',
      _reporter_id: 'usr_traveller_other',
      _reporter_count: 2,
      _assigned_unit_label: null,
    }),
    incident({
      incident_id: 'inc_tankbund_accident',
      category: 'accident',
      severity: 'high',
      status: 'verified',
      summary: 'Two-wheeler collision on Tank Bund Road; traffic is slow.',
      location_label: 'Tank Bund Road',
      coordinates: { lat: 17.4169, lng: 78.4747 },
      reported_at: minutesAgo(50),
      updated_at: minutesAgo(35),
      visibility: 'public',
      _reporter_id: 'usr_traveller_other',
      _reporter_count: 1,
      _assigned_unit_label: 'Traffic unit (demo)',
    }),
    incident({
      incident_id: 'inc_necklace_lighting',
      category: 'unsafe_area',
      severity: 'low',
      status: 'reported',
      summary: 'Poorly lit underpass near the lakeside road after dark.',
      location_label: 'Necklace Road',
      coordinates: { lat: 17.4115, lng: 78.4649 },
      reported_at: minutesAgo(8 * 60),
      updated_at: minutesAgo(8 * 60),
      visibility: 'reporter',
      _reporter_id: U.priya,
      _reporter_count: 1,
      _assigned_unit_label: null,
    }),
    incident({
      incident_id: 'inc_golconda_medical',
      category: 'medical',
      severity: 'critical',
      status: 'reported',
      summary: 'Visitor feeling unwell near the fort’s upper levels.',
      location_label: 'Golconda Fort',
      coordinates: { lat: 17.3833, lng: 78.4011 },
      reported_at: minutesAgo(15),
      updated_at: minutesAgo(15),
      visibility: 'reporter',
      _reporter_id: 'usr_traveller_4821',
      _reporter_count: 1,
      _assigned_unit_label: null,
    }),
    incident({
      incident_id: 'inc_ananya_lost',
      category: 'lost_item',
      severity: 'low',
      status: 'resolved',
      summary: 'Lost a phone case near the tombs’ entrance.',
      location_label: 'Qutb Shahi Tombs',
      coordinates: { lat: 17.3949, lng: 78.3968 },
      reported_at: minutesAgo(30 * 1440),
      updated_at: minutesAgo(29 * 1440),
      visibility: 'reporter',
      _reporter_id: U.ananya,
      _reporter_count: 1,
      _assigned_unit_label: null,
    }),
  ];
}

const sosNotifications = (at: string): SosNotificationDto[] => [
  { channel: 'travindi_team', recipient_label: 'TravIndi operations desk', status: 'delivered', updated_at: at },
  { channel: 'authority', recipient_label: 'Emergency services (112)', status: 'not_supported', updated_at: at },
];

export function seedSos(): SosRecord[] {
  const base = (id: string, minutes: number): Pick<SosRecord, 'alert_id' | 'client_alert_id' | 'received_at' | 'notifications' | 'guidance'> => ({
    alert_id: id,
    client_alert_id: `seed-${id}`,
    received_at: minutesAgo(minutes),
    notifications: sosNotifications(minutesAgo(minutes)),
    guidance: SOS_GUIDANCE,
  });
  return [
    {
      ...base('sos_demo_golconda', 3),
      status: 'received',
      acknowledged_at: null,
      resolved_at: null,
      acknowledged_by_label: null,
      _owner_id: 'usr_traveller_4821',
      _trip_id: null,
      _coordinates: { lat: 17.3838, lng: 78.4018 },
      _accuracy_meters: 35,
      _message: null,
      _location_label: 'Golconda Fort',
      _priority: 'high',
      _last_update_at: minutesAgo(3),
      _assigned_to_label: null,
    },
    {
      ...base('sos_demo_lake', 25),
      status: 'responding',
      acknowledged_at: minutesAgo(22),
      resolved_at: null,
      acknowledged_by_label: 'Operations Desk (demo)',
      _owner_id: 'usr_traveller_5310',
      _trip_id: null,
      _coordinates: { lat: 17.4239, lng: 78.4738 },
      _accuracy_meters: 20,
      _message: 'Separated from my group.',
      _location_label: 'Hussain Sagar promenade',
      _priority: 'normal',
      _last_update_at: minutesAgo(10),
      _assigned_to_label: 'Lakeside patrol (demo)',
    },
    {
      ...base('sos_demo_resolved', 300),
      status: 'resolved',
      acknowledged_at: minutesAgo(297),
      resolved_at: minutesAgo(260),
      acknowledged_by_label: 'Operations Desk (demo)',
      _owner_id: 'usr_traveller_2277',
      _trip_id: null,
      _coordinates: { lat: 17.3616, lng: 78.4747 },
      _accuracy_meters: 50,
      _message: null,
      _location_label: 'Charminar',
      _priority: 'normal',
      _last_update_at: minutesAgo(260),
      _assigned_to_label: 'Old City patrol (demo)',
    },
  ];
}

export function seedCheckIns(): CheckInRecord[] {
  return [
    {
      check_in_id: 'ci_back_at_hotel',
      trip_id: T.hyderabad,
      due_at: atLocal(21, 30),
      status: 'scheduled',
      completed_at: null,
      note: 'Back at the hotel',
      _owner_id: U.ananya,
    },
  ];
}

type BookingRecord = MockState['bookings'][number];

const ticket = (bookingId: string, code: string, validFrom: string | null) => ({
  ticket_id: `tkt_${bookingId}`,
  booking_id: bookingId,
  code,
  issued_at: minutesAgo(5 * 1440),
  valid_from: validFrom,
  valid_until: null,
  qr_payload: `travindi:ticket:${bookingId}:${code}`,
});

export function seedBookings(): BookingRecord[] {
  const provider = (id: string) => {
    const business = findBusiness(id);
    const guide = findGuide(id);
    return {
      provider_id: id,
      provider_type: business ? ('business' as const) : ('guide' as const),
      name: (business ?? guide)!.name,
      verified: true,
    };
  };
  const price = (rupees: number): BookingDto['price'] => ({
    status: 'authoritative',
    value: { amount_minor: rupees * 100, currency: 'INR' },
    source_label: 'Provider’s listed price',
    updated_at: minutesAgo(5 * 1440),
  });

  return [
    {
      booking_id: 'bkg_oldcity',
      client_booking_id: 'seed-bkg-oldcity',
      trip_id: T.hyderabad,
      service_id: 'svc_oldcity_walk',
      service_name: 'Slow-paced Old City heritage walk',
      unit: 'person',
      nights: null,
      provider: provider('biz_oldcity_walks'),
      date: dateOffset(1),
      time_slot: '07:00',
      quantity: 4,
      price: price(4800),
      status: 'confirmed',
      confirmation_code: 'TVD-7Q4K2M',
      ticket: ticket('bkg_oldcity', 'TVD-7Q4K2M', atLocal(6, 30, 1)),
      failure_reason: null,
      created_at: minutesAgo(5 * 1440),
      updated_at: minutesAgo(5 * 1440),
      _owner_id: U.ananya,
      _contact_name: 'Ananya Rao',
    },
    {
      booking_id: 'bkg_cab',
      client_booking_id: 'seed-bkg-cab',
      trip_id: T.hyderabad,
      service_id: 'svc_city_cab',
      service_name: 'Full-day city cab with driver (8 hours)',
      unit: 'vehicle',
      nights: null,
      provider: provider('biz_deccan_cabs'),
      date: dateOffset(0),
      time_slot: '09:00',
      quantity: 1,
      price: price(2800),
      status: 'payment_pending',
      confirmation_code: null,
      ticket: null,
      failure_reason: null,
      created_at: minutesAgo(1440),
      updated_at: minutesAgo(1440),
      _owner_id: U.ananya,
      _contact_name: 'Ananya Rao',
    },
    {
      booking_id: 'bkg_kerala_walk',
      client_booking_id: 'seed-bkg-kerala',
      trip_id: T.kerala,
      service_id: 'svc_anjali_fortkochi',
      service_name: 'Fort Kochi heritage walk',
      unit: 'group',
      nights: null,
      provider: provider('gd_anjali_menon'),
      date: dateOffset(-63),
      time_slot: '08:00',
      quantity: 2,
      price: price(2200),
      status: 'confirmed',
      confirmation_code: 'TVD-3HX9PA',
      ticket: ticket('bkg_kerala_walk', 'TVD-3HX9PA', null),
      failure_reason: null,
      created_at: minutesAgo(75 * 1440),
      updated_at: minutesAgo(63 * 1440),
      _owner_id: U.ananya,
      _contact_name: 'Ananya Rao',
    },
    {
      booking_id: 'bkg_farhan_iyer',
      client_booking_id: 'seed-bkg-farhan',
      trip_id: null,
      service_id: 'svc_farhan_private',
      service_name: 'Private heritage walk (3 hours)',
      unit: 'group',
      nights: null,
      provider: provider('gd_farhan_ali'),
      date: dateOffset(2),
      time_slot: '08:00',
      quantity: 5,
      price: price(2500),
      status: 'confirmed',
      confirmation_code: 'TVD-8LM2QD',
      ticket: ticket('bkg_farhan_iyer', 'TVD-8LM2QD', atLocal(7, 45, 2)),
      failure_reason: null,
      created_at: minutesAgo(4 * 1440),
      updated_at: minutesAgo(4 * 1440),
      _owner_id: 'usr_traveller_iyer',
      _contact_name: 'S. Iyer',
    },
  ];
}

export function seedVerificationRequests(): VerificationRequestDto[] {
  const doc = (id: string, kind: VerificationRequestDto['documents'][number]['kind'], status: VerificationRequestDto['documents'][number]['status'], days: number) => ({
    document_id: id,
    kind,
    status,
    uploaded_at: minutesAgo(days * 1440),
  });
  return [
    {
      request_id: 'vr_nizams_table',
      subject_type: 'business',
      subject_id: 'biz_nizams_table',
      subject_name: 'Nizam’s Table',
      destination_name: 'Hyderabad',
      submitted_at: minutesAgo(4 * 1440),
      status: 'pending',
      documents: [doc('doc_nt_reg', 'business_registration', 'received', 4)],
      review_flags: ['Registered name differs slightly from the listing name.'],
    },
    {
      request_id: 'vr_rukhsana',
      subject_type: 'guide',
      subject_id: 'gd_rukhsana_begum',
      subject_name: 'Rukhsana Begum',
      destination_name: 'Hyderabad',
      submitted_at: minutesAgo(6 * 1440),
      status: 'in_review',
      documents: [doc('doc_rb_id', 'identity', 'accepted', 6), doc('doc_rb_lic', 'guide_licence', 'received', 6)],
      review_flags: [],
    },
    {
      request_id: 'vr_tenzin',
      subject_type: 'guide',
      subject_id: 'gd_tenzin_dorje',
      subject_name: 'Tenzin Dorje',
      destination_name: 'Leh & Ladakh',
      submitted_at: minutesAgo(12 * 1440),
      status: 'needs_info',
      documents: [doc('doc_td_id', 'identity', 'accepted', 12), doc('doc_td_lic', 'guide_licence', 'rejected', 12)],
      review_flags: ['Licence image is unreadable.'],
    },
    {
      request_id: 'vr_bangle_studio',
      subject_type: 'business',
      subject_id: 'biz_bangle_studio',
      subject_name: 'Pearl & Bangle Studio',
      destination_name: 'Hyderabad',
      submitted_at: minutesAgo(2 * 1440),
      status: 'pending',
      documents: [doc('doc_bs_id', 'identity', 'received', 2)],
      review_flags: ['No business registration document yet.'],
    },
    {
      request_id: 'vr_kochi_harbour',
      subject_type: 'business',
      subject_id: 'biz_kochi_harbour',
      subject_name: 'Fort Kochi Harbour Cruises',
      destination_name: 'Kochi',
      submitted_at: minutesAgo(1440),
      status: 'pending',
      documents: [doc('doc_kh_reg', 'business_registration', 'received', 1)],
      review_flags: [],
    },
  ];
}

export function seedPartnerProfiles(): Record<string, PartnerProfileDto> {
  const farhan = GUIDES.find((g) => g.guide_id === 'gd_farhan_ali')!;
  const oldcity = BUSINESSES.find((b) => b.business_id === 'biz_oldcity_walks')!;
  return {
    gd_farhan_ali: {
      provider_id: farhan.guide_id,
      provider_type: 'guide',
      name: farhan.name,
      description: farhan.bio,
      languages: farhan.languages,
      kyc_status: 'approved',
      kyc_note: null,
      verification: farhan.verification,
      services: farhan.services,
      updated_at: minutesAgo(20 * 1440),
    },
    biz_oldcity_walks: {
      provider_id: oldcity.business_id,
      provider_type: 'business',
      name: oldcity.name,
      description: oldcity.description,
      languages: oldcity.languages,
      kyc_status: 'approved',
      kyc_note: null,
      verification: oldcity.verification,
      services: oldcity.services,
      updated_at: minutesAgo(30 * 1440),
    },
  };
}

export function seedAvailability(): AvailabilitySlotDto[] {
  const slots: AvailabilitySlotDto[] = [];
  for (let day = 0; day < 7; day++) {
    const date = dateOffset(day);
    slots.push({ slot_id: `slot_farhan_${day}`, service_id: 'svc_farhan_private', date, time_slot: '08:00', capacity: 1, booked: day === 2 ? 1 : 0, status: 'open' });
    slots.push({ slot_id: `slot_walk_am_${day}`, service_id: 'svc_oldcity_walk', date, time_slot: '07:00', capacity: 8, booked: day === 1 ? 4 : 0, status: 'open' });
    slots.push({ slot_id: `slot_walk_pm_${day}`, service_id: 'svc_oldcity_walk', date, time_slot: '16:30', capacity: 8, booked: 0, status: day === 5 ? 'closed' : 'open' });
  }
  return slots;
}

export function seedComplaints(): MockState['complaints'] {
  return [
    {
      complaint_id: 'cmp_farhan_late',
      booking_id: null,
      category: 'Punctuality',
      summary: 'Traveller says the guide arrived about 20 minutes after the agreed time.',
      status: 'open',
      created_at: minutesAgo(6 * 1440),
      _provider_id: 'gd_farhan_ali',
      _response: null,
    },
    {
      complaint_id: 'cmp_oldcity_stops',
      booking_id: null,
      category: 'Listing accuracy',
      summary: 'Traveller says the food trail included fewer stops than listed.',
      status: 'open',
      created_at: minutesAgo(3 * 1440),
      _provider_id: 'biz_oldcity_walks',
      _response: null,
    },
  ];
}
