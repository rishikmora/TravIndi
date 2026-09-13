import type {
  AdaptationProposalDto,
  AvailabilitySlotDto,
  BookingDto,
  BookingQuoteDto,
  CheckInDto,
  CommunityPostDto,
  ComplaintDto,
  ConsentDto,
  ConversationDto,
  CrowdSignalDto,
  DataRequestDto,
  FraudReportDto,
  GenerationJobDto,
  IncidentDto,
  ItineraryDto,
  ItineraryVersionDto,
  LocationShareDto,
  MessageDto,
  NotificationDto,
  PartnerProfileDto,
  ProfileDto,
  SosAlertDto,
  TripDto,
  TrustedContactDto,
  UserDto,
  VerificationEvidenceDto,
  VerificationRequestDto,
  AdvisoryDto,
  GeoPointDto,
} from '@/types/api';
import type { ChannelName } from '@/types/realtime/events';
import type { ProposalPayload } from './logic/adaptation';

/*
 * Internal records. Fields prefixed with `_` never leave the mock backend;
 * handlers project records to the documented DTOs before responding.
 */

export interface UserRecord extends UserDto {
  _password: string;
  /** Partner accounts: the business or guide listing they manage. */
  _provider_id: string | null;
}

export interface ConversationRecord extends Omit<ConversationDto, 'last_message' | 'unread_count' | 'members_count'> {
  _read: Record<string, string | null>;
}

export interface MessageRecord extends Omit<MessageDto, 'reactions' | 'status'> {
  _reactions: Record<string, string[]>;
}

export interface TrustedContactRecord extends TrustedContactDto {
  _owner_id: string;
  _linked_user_id: string | null;
  _phone: string | null;
  _email: string | null;
}

export interface ShareRecord extends LocationShareDto {
  _ended_at: string | null;
  _audience: 'trip_members' | 'trusted_contacts' | 'custom';
}

export interface SosRecord extends SosAlertDto {
  _owner_id: string;
  _trip_id: string | null;
  _coordinates: GeoPointDto | null;
  _accuracy_meters: number | null;
  _message: string | null;
  _location_label: string | null;
  _priority: 'critical' | 'high' | 'normal';
  _last_update_at: string;
  _assigned_to_label: string | null;
}

export interface IncidentRecord extends IncidentDto {
  _reporter_id: string | null;
  _client_report_id: string | null;
  _reporter_count: number;
  _assigned_unit_label: string | null;
}

export interface JobRecord extends GenerationJobDto {
  _started_ms: number;
  _fail: boolean;
}

export interface CheckInRecord extends CheckInDto {
  _owner_id: string;
}

export interface OwnedRecord<T> {
  owner_id: string;
  value: T;
}

export interface MockState {
  schema: number;
  seeded_on: string;
  users: UserRecord[];
  profiles: Record<string, ProfileDto>;
  consents: Record<string, ConsentDto[]>;
  data_requests: Record<string, DataRequestDto[]>;
  saved_places: Record<string, string[]>;
  trips: TripDto[];
  itineraries: Record<string, ItineraryDto[]>;
  versions: Record<string, ItineraryVersionDto[]>;
  jobs: JobRecord[];
  proposals: AdaptationProposalDto[];
  proposal_payloads: Record<string, ProposalPayload>;
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  shares: ShareRecord[];
  trusted_contacts: TrustedContactRecord[];
  check_ins: CheckInRecord[];
  incidents: IncidentRecord[];
  sos: SosRecord[];
  advisories: Record<string, AdvisoryDto[]>;
  crowd_reports: CrowdSignalDto[];
  quotes: Array<OwnedRecord<BookingQuoteDto>>;
  bookings: Array<BookingDto & { _owner_id: string; _contact_name: string }>;
  notifications: Array<NotificationDto & { _user_id: string }>;
  community_posts: CommunityPostDto[];
  helpful: Record<string, string[]>;
  verification_requests: VerificationRequestDto[];
  fraud_reports: Array<OwnedRecord<FraudReportDto>>;
  partner_profiles: Record<string, PartnerProfileDto>;
  /** Verification evidence updated by authority decisions, keyed by provider id. */
  evidence_overrides: Record<string, VerificationEvidenceDto[]>;
  availability: AvailabilitySlotDto[];
  complaints: Array<ComplaintDto & { _provider_id: string; _response: string | null }>;
  idempotency: Record<string, { status: number; body: unknown }>;
}

export const MOCK_SCHEMA_VERSION = 5;
const DB_KEY = 'travindi:mock-db';
const SESSION_KEY = 'travindi:mock-session';

interface SessionRecord {
  user_id: string;
  expires_at: string;
}

const storage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export class MockStore {
  state: MockState;
  private session: SessionRecord | null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly seed: () => MockState) {
    this.state = this.load() ?? seed();
    this.session = this.loadSession();
    this.persist();
  }

  private load(): MockState | null {
    try {
      const raw = storage()?.getItem(DB_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MockState;
      // Reseed on schema changes, and daily so the demo trip stays current.
      if (parsed.schema !== MOCK_SCHEMA_VERSION || parsed.seeded_on !== new Date().toDateString()) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private loadSession(): SessionRecord | null {
    try {
      const raw = storage()?.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SessionRecord;
      if (!this.state.users.some((u) => u.user_id === parsed.user_id)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Debounced write so bursts of mutations cost one serialisation. */
  persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        storage()?.setItem(DB_KEY, JSON.stringify(this.state));
      } catch {
        // Storage full or blocked: the mock keeps working in memory.
      }
    }, 150);
  }

  reset() {
    this.state = this.seed();
    this.persist();
  }

  // Session ------------------------------------------------------------------

  get sessionUser(): UserRecord | null {
    if (!this.session) return null;
    if (Date.parse(this.session.expires_at) < Date.now()) return null;
    return this.user(this.session.user_id) ?? null;
  }

  get sessionExpiresAt() {
    return this.session?.expires_at ?? null;
  }

  startSession(userId: string, hours = 12) {
    this.session = { user_id: userId, expires_at: new Date(Date.now() + hours * 3_600_000).toISOString() };
    storage()?.setItem(SESSION_KEY, JSON.stringify(this.session));
    return this.session;
  }

  endSession() {
    this.session = null;
    storage()?.removeItem(SESSION_KEY);
  }

  /** Development scenario: the session lapses without the client knowing. */
  expireSession() {
    if (!this.session) return;
    this.session = { ...this.session, expires_at: new Date(Date.now() - 1000).toISOString() };
    storage()?.setItem(SESSION_KEY, JSON.stringify(this.session));
  }

  // Lookups ------------------------------------------------------------------

  user(userId: string) {
    return this.state.users.find((u) => u.user_id === userId);
  }

  displayName(userId: string) {
    return this.user(userId)?.display_name ?? 'TravIndi traveller';
  }

  trip(tripId: string) {
    return this.state.trips.find((t) => t.trip_id === tripId);
  }

  isTripMember(userId: string, tripId: string) {
    return Boolean(this.trip(tripId)?.members.some((m) => m.user_id === userId));
  }

  tripsFor(userId: string) {
    return this.state.trips.filter((t) => t.members.some((m) => m.user_id === userId));
  }

  currentItinerary(tripId: string) {
    const versions = this.state.itineraries[tripId] ?? [];
    return versions[versions.length - 1] ?? null;
  }

  conversation(conversationId: string) {
    return this.state.conversations.find((c) => c.conversation_id === conversationId);
  }

  isConversationMember(userId: string, conversationId: string) {
    const conversation = this.conversation(conversationId);
    if (!conversation) return false;
    if (conversation.kind === 'community') return true;
    return conversation.members.some((m) => m.user_id === userId);
  }

  share(shareId: string) {
    return this.state.shares.find((s) => s.share_id === shareId);
  }

  /** Whether `userId` is an intended recipient of a share (never the owner). */
  isShareRecipient(userId: string, share: ShareRecord) {
    if (share.owner_id === userId) return false;
    return share.recipients.some((recipient) => {
      if (recipient.kind === 'user') return recipient.recipient_id === userId;
      if (recipient.kind === 'trip') return this.isTripMember(userId, recipient.recipient_id);
      const contact = this.state.trusted_contacts.find((c) => c.contact_id === recipient.recipient_id);
      return contact?._linked_user_id === userId;
    });
  }

  canViewShare(userId: string, share: ShareRecord) {
    if (share.owner_id === userId) return true;
    return (share.status === 'active' || share.status === 'paused') && this.isShareRecipient(userId, share);
  }

  hasConsent(userId: string, consentId: string) {
    return Boolean(this.state.consents[userId]?.find((c) => c.consent_id === consentId)?.granted);
  }

  /** Server-side authorisation for realtime channels. */
  canSubscribe(userId: string, channel: ChannelName) {
    const [kind, id] = channel.split(':') as [string, string | undefined];
    const user = this.user(userId);
    if (!user) return false;
    switch (kind) {
      case 'user':
        return id === userId;
      case 'trip':
        return Boolean(id && this.isTripMember(userId, id));
      case 'conversation':
        return Boolean(id && this.isConversationMember(userId, id));
      case 'location_share': {
        const share = id ? this.share(id) : undefined;
        return Boolean(share && this.canViewShare(userId, share));
      }
      case 'authority':
        return user.roles.includes('authority') || user.roles.includes('admin');
      default:
        return false;
    }
  }

  providerIdFor(userId: string) {
    return this.user(userId)?._provider_id ?? null;
  }
}
