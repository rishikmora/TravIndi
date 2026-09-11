/**
 * Typed client for the TravIndi backend (Phase 8-10 P0 endpoints).
 * Unwraps the canonical `{data, meta}` / `{error}` envelopes
 * (docs/00-planning/01-project-master-model.md §L) so callers just get
 * plain typed values or a thrown ApiError.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, body: { code: string; message: string; details: Record<string, unknown> }) {
    super(body.message);
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

// Thrown when `fetch` itself fails (offline, DNS failure, timeout) — distinct
// from `ApiError`, which means the server was reached and rejected the
// request. Callers need this distinction to decide whether to queue a
// mutation for later (NetworkError) or surface a real rejection (ApiError).
export class NetworkError extends Error {
  constructor() {
    super("The network is unavailable.");
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new NetworkError();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (body?.error) {
      throw new ApiError(response.status, body.error);
    }
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface Destination {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  location: GeoPoint;
  timezone: string;
  status: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attraction {
  id: string;
  destination_id: string;
  name: string;
  category: string | null;
  location: GeoPoint;
  capacity: number | null;
}

export type TripPace = "relaxed" | "balanced" | "packed";
export type SafetyPreference = "standard" | "high" | "very_high";
export type QuickReplanAction =
  | "cheaper"
  | "more_relaxed"
  | "more_heritage"
  | "more_food"
  | "less_walking"
  | "avoid_crowds"
  | "improve_safety";

export interface Trip {
  id: string;
  user_id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  currency: string;
  status: string;
  is_public: boolean;
  interests: string[];
  avoid: string[];
  pace: TripPace | null;
  safety_preference: SafetyPreference | null;
  days: number | null;
  nights: number | null;
  created_at: string;
  updated_at: string;
}

export interface ItineraryItem {
  id: string;
  item_type: string;
  attraction_id: string | null;
  attraction_name: string | null;
  sequence: number;
  day_offset: number | null;
  time_of_day: string | null;
  scheduled_time: string | null;
  cost: number | null;
  currency: string;
  reason_code: string | null;
  explanation: string | null;
  nearest_accessible_facility_m: number | null;
  note: string | null;
  completed: boolean;
  item_version: number;
}

export interface Itinerary {
  id: string;
  trip_id: string;
  destination_id: string | null;
  version: number;
  generated_by: string;
  total_cost: number | null;
  currency: string;
  cost_estimate_available: boolean;
  replan_reason: string | null;
  previous_version: number | null;
  unmatched_avoid_terms: string[];
  items: ItineraryItem[];
}

export interface AdaptationProposalChangeItem {
  attraction_id: string;
  attraction_name: string | null;
  day_offset: number;
  time_of_day: string;
  reason: string;
}

export interface AdaptationProposalChanges {
  summary: string;
  model: string;
  proposed_items: AdaptationProposalChangeItem[];
  added_attraction_ids: string[];
  removed_attraction_ids: string[];
  kept_attraction_ids: string[];
  usage: { input_tokens: number; output_tokens: number; cost_usd: number; latency_ms: number };
}

export interface AdaptationProposal {
  id: string;
  trip_id: string;
  based_on_itinerary_id: string;
  trigger_event_id: string;
  reason_code: string;
  changes: AdaptationProposalChanges;
  risk_level: string;
  confidence: number | null;
  status: string;
  applied_itinerary_id: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
}

export interface DestinationCandidate {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  has_attractions: boolean;
}

export interface TripIntentExtractResult {
  destination_id: string | null;
  destination_candidates: DestinationCandidate[];
  days: number | null;
  nights: number | null;
  budget: number | null;
  interests: string[];
  avoid: string[];
  traveler_type_hint: TravelerType | null;
  missing_required: string[];
}

// --- Offline sync ---
export type SyncEntityType = "sos" | "incident" | "itinerary_item";

export interface SyncOperationIn {
  operation_id: string;
  entity_type: SyncEntityType;
  operation: "CREATE" | "UPDATE" | "DELETE";
  client_timestamp: string;
  payload: Record<string, unknown>;
}

export interface SyncConflict {
  operation_id: string;
  error_code: string;
  current_state: Record<string, unknown> | null;
}

export interface SyncRejection {
  operation_id: string;
  error_code: string;
}

export interface SyncAck {
  acknowledged_operation_ids: string[];
  skipped_operation_ids: string[];
  conflicted: SyncConflict[];
  rejected: SyncRejection[];
  server_time: string;
}

export interface Consent {
  id: string;
  purpose: string;
  status: string;
  version: string;
  granted_at: string | null;
  revoked_at: string | null;
}

export interface Me {
  id: string;
  email: string | null;
  phone: string | null;
  account_type: string;
  status: string;
  created_at: string;
  preferred_language: string | null;
  travel_preferences: Record<string, unknown>;
  accessibility_preferences: Record<string, unknown>;
  notification_preferences: Record<string, unknown>;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export type AccountType = "tourist" | "guide" | "business";

export interface TrustedContactToken {
  trusted_contact_id: string;
  trusted_contact_name: string;
  token: string;
  expires_at: string;
}

export interface Sos {
  id: string;
  user_id: string;
  status: string;
  emergency_type: string | null;
  severity: string | null;
  location: GeoPoint;
  local_ack_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  trusted_contact_tokens: TrustedContactToken[];
}

export interface TrustedContact {
  id: string;
  name: string;
  relationship_label: string | null;
  phone: string | null;
  email: string | null;
}

export interface Incident {
  id: string;
  reporter_user_id: string;
  incident_type: string;
  severity: string;
  status: string;
  location: GeoPoint;
  description: string | null;
  assigned_to_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  priority: string;
  notification_type: string;
  title: string;
  body: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface RouteResult {
  id: string;
  mode: string;
  score: number | null;
  reasons: Record<string, unknown>;
  confidence: number | null;
}

export interface AuthorityDashboard {
  active_sos_count: number;
  open_incident_count: number;
  high_risk_cell_count: number;
}

// --- Administration (Feature Blueprint P1 FR-40) ---
export const KNOWN_ROLES = [
  "tourist",
  "guide",
  "business",
  "authority_police",
  "authority_emergency_responder",
  "authority_tourism_dept",
  "authority_municipality",
  "authority_verifier",
  "authority_platform_admin",
] as const;
export type KnownRole = (typeof KNOWN_ROLES)[number];

export interface AdminUser {
  id: string;
  email: string | null;
  phone: string | null;
  account_type: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  realm_roles: string[];
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: string;
  occurred_at: string;
  audit_metadata: Record<string, unknown>;
}

export interface PolicyRegistryEntry {
  id: string;
  name: string;
  description: string | null;
  version: string;
  active: boolean;
}

export interface RetentionRuleEntry {
  id: string;
  data_class: string;
  retention_period_days: number | null;
  description: string | null;
}

export interface SafetyScore {
  destination_id: string;
  score: number;
  computed_at: string;
  model_version: string | null;
}

export interface CrowdCell {
  h3_cell: string;
  destination_id: string | null;
  observed_at: string;
  density: number | null;
  risk_score: number | null;
}

export interface CrowdHeatmapPoint {
  h3_cell: string;
  destination_id: string | null;
  destination_name: string | null;
  location: GeoPoint | null;
  recorded_at: string;
  baseline_density: number | null;
  baseline_risk_score: number | null;
  density: number | null;
  risk_score: number | null;
  computed_at: string;
  method: string;
}

export type BusinessCategory =
  | "HOTEL"
  | "RESTAURANT"
  | "TAXI"
  | "ARTISAN"
  | "TOUR_OPERATOR"
  | "AIRLINE"
  | "RAILWAY"
  | "BUS_OPERATOR"
  | "OTHER";

export const TRANSPORT_CATEGORIES: BusinessCategory[] = ["AIRLINE", "RAILWAY", "BUS_OPERATOR"];

export type DietaryOption = "VEGETARIAN" | "VEGAN" | "JAIN" | "HALAL" | "GLUTEN_FREE" | "NON_VEGETARIAN";
export type PriceRange = "BUDGET" | "MODERATE" | "PREMIUM";

export interface BusinessProfile {
  description: string | null;
  image_url: string | null;
  contact_info: Record<string, unknown>;
  accessibility_features: Record<string, unknown>;
  safety_score: number | null;
  women_friendly_score: number | null;
  family_friendly_score: number | null;
  cuisines: string[];
  dietary_options: DietaryOption[];
  price_range: PriceRange | null;
}

export interface Business {
  id: string;
  owner_user_id: string;
  name: string;
  category: BusinessCategory;
  destination_id: string | null;
  location: GeoPoint | null;
  is_verified: boolean;
  is_eco_certified: boolean;
  profile: BusinessProfile | null;
  created_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  currency: string;
  origin_destination_id: string | null;
  destination_destination_id: string | null;
}

export interface TransportSearchResult {
  service_id: string;
  business_id: string;
  business_name: string;
  category: BusinessCategory;
  origin_destination_id: string | null;
  origin_name: string | null;
  destination_destination_id: string | null;
  destination_name: string | null;
  availability_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  remaining: number;
  base_price: number | null;
  currency: string;
}

export interface Guide {
  id: string;
  user_id: string;
  languages: string[];
  specialties: string[];
  destination_id: string | null;
  is_verified: boolean;
  bio: string | null;
  created_at: string;
}

export type VerificationSubjectType = "BUSINESS" | "GUIDE";
export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Verification {
  id: string;
  subject_type: VerificationSubjectType;
  subject_id: string;
  submitted_by_user_id: string;
  status: VerificationStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface ReviewAnalysis {
  authenticity_score: number | null;
  flags: string[];
  model_version: string;
}

export type ReviewTargetType = "DESTINATION" | "ATTRACTION" | "BUSINESS" | "GUIDE";

export interface Review {
  id: string;
  author_user_id: string;
  target_type: ReviewTargetType;
  target_id: string;
  rating: number;
  body: string | null;
  status: string;
  created_at: string;
  analysis: ReviewAnalysis | null;
}

export interface FraudSignal {
  signal_type: string;
  confidence: number | null;
  details: Record<string, unknown>;
}

export type FraudCaseStatus = "OPEN" | "CONFIRMED" | "DISMISSED";

export interface FraudCase {
  id: string;
  reported_by_user_id: string | null;
  subject_type: string;
  subject_id: string | null;
  description: string;
  status: FraudCaseStatus;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
  signals: FraudSignal[];
}

export interface GuideAnswerSource {
  chunk_id: string;
  document_title: string;
}

export interface GuideAnswer {
  answer: string;
  sources: GuideAnswerSource[];
}

export type FacilityType =
  | "WHEELCHAIR_RAMP"
  | "ACCESSIBLE_TOILET"
  | "ELEVATOR"
  | "ACCESSIBLE_PARKING"
  | "FIRST_AID"
  | "INFORMATION_DESK"
  | "DRINKING_WATER"
  | "OTHER";

export interface Facility {
  id: string;
  destination_id: string;
  name: string;
  facility_type: string;
  location: GeoPoint;
}

export interface AccessibilityPreferences {
  high_contrast: boolean;
  large_text: boolean;
  reduce_motion: boolean;
}

// --- Disability-aware personalized experience (HIGH PRIORITY differentiator) ---
export type TravelerType = "SOLO" | "ACCESSIBILITY" | "FAMILY";
export type AccessibilityNeed = "WHEELCHAIR" | "VISUAL_IMPAIRMENT" | "HEARING_IMPAIRMENT" | "REDUCED_MOBILITY";

export interface TravelPreferences {
  traveler_type: TravelerType;
  accessibility_needs: AccessibilityNeed[];
  family_children_count: number;
  family_seniors_count: number;
}

export interface DemandForecast {
  destination_id: string;
  planned_visits_next_30_days: number;
  confirmed_bookings_next_30_days: number;
  recent_planning_momentum_7_days: number;
  method: string;
  computed_at: string;
}

export interface AnalyticsOverview {
  total_destinations: number;
  total_businesses: number;
  verified_businesses: number;
  total_guides: number;
  verified_guides: number;
  total_trips: number;
  confirmed_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_reviews: number;
  average_review_authenticity: number | null;
  open_fraud_cases: number;
  computed_at: string;
}

export interface TrendingDestination {
  destination_id: string;
  destination_name: string;
  itinerary_items_last_7_days: number;
}

export interface FeatureAdoption {
  total_points_awarded: number;
  total_badges_awarded: number;
  total_check_ins: number;
  total_lost_reports: number;
  total_found_reports: number;
  total_confirmed_lost_found_matches: number;
  total_expenses_logged: number;
  total_receipt_scans_used: number;
  total_group_trips: number;
  total_active_group_members: number;
  total_discussion_posts: number;
  total_public_trip_journals: number;
  total_eco_certified_businesses: number;
  computed_at: string;
}

// --- Gamification (Feature Blueprint P2 #15/#26) ---
export type GamificationCategory = "EXPLORATION" | "HERITAGE" | "LOCAL_ECONOMY" | "RESPONSIBLE_TOURISM" | "COMMUNITY";

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  category: GamificationCategory;
  icon_key: string;
  points_value: number;
}

export interface UserBadge {
  badge: Badge;
  awarded_at: string;
  awarded_reason: string;
}

export interface PointsSummary {
  total_points: number;
  by_category: Record<string, number>;
}

export interface MeGamification {
  points: PointsSummary;
  badges: UserBadge[];
  destinations_visited: number;
}

export interface Challenge {
  id: string;
  code: string;
  name: string;
  description: string;
  category: GamificationCategory;
  target_count: number;
  points_reward: number;
  badge: Badge | null;
  my_progress_count: number;
  my_completed_at: string | null;
}

export interface LeaderboardEntry {
  display_name: string;
  total_points: number;
  rank: number;
}

export interface CheckIn {
  id: string;
  destination_id: string;
  checked_in_at: string;
  points_awarded: number;
  new_badges: Badge[];
}

export interface PointsHistoryEntry {
  id: string;
  points: number;
  category: GamificationCategory;
  reason: string;
  related_entity_type: string | null;
  created_at: string;
}

export interface VisitedDestination {
  destination_id: string;
  destination_name: string;
  first_checked_in_at: string;
  check_in_count: number;
}

export interface MyRank {
  rank: number | null;
  total_points: number;
  category: GamificationCategory | null;
}

// --- Lost & Found (Feature Blueprint P2 #26) ---
export type LostFoundCategory = "ELECTRONICS" | "DOCUMENTS" | "BAG_LUGGAGE" | "CLOTHING" | "JEWELRY" | "OTHER";
export type LostItemStatus = "OPEN" | "MATCHED" | "RESOLVED" | "CLOSED";
export type FoundItemStatus = "OPEN" | "CLAIMED" | "RETURNED";
export type LostFoundMatchStatus = "SUGGESTED" | "CONFIRMED" | "REJECTED";

export interface LostItem {
  id: string;
  reporter_user_id: string;
  category: LostFoundCategory;
  title: string;
  description: string;
  lost_at: string;
  destination_id: string | null;
  location: GeoPoint | null;
  status: LostItemStatus;
  created_at: string;
}

export interface FoundItem {
  id: string;
  finder_user_id: string;
  category: LostFoundCategory;
  title: string;
  description: string;
  found_at: string;
  destination_id: string | null;
  location: GeoPoint | null;
  storage_location: string | null;
  status: FoundItemStatus;
  created_at: string;
}

export interface LostFoundMatchEntry {
  id: string;
  lost_item: LostItem;
  found_item: FoundItem;
  similarity_score: number;
  status: LostFoundMatchStatus;
  created_at: string;
}

// --- Financial Intelligence (Feature Blueprint P2 #14) ---
export type ExpenseCategory = "ACCOMMODATION" | "FOOD" | "TRANSPORT" | "SHOPPING" | "ACTIVITIES" | "OTHER";
export type ExpenseSource = "MANUAL" | "RECEIPT_SCAN";

export interface Expense {
  id: string;
  user_id: string;
  trip_id: string | null;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  description: string | null;
  incurred_at: string;
  source: ExpenseSource;
  created_at: string;
}

export interface ReceiptScanResult {
  no_receipt_detected: boolean;
  amount: number;
  currency: string;
  vendor: string;
  category_guess: ExpenseCategory;
  date_text: string;
  model_version: string;
}

export interface TripFinancialSummary {
  trip_id: string;
  budget: number | null;
  currency: string;
  total_spent: number;
  remaining: number | null;
  is_over_budget: boolean;
  by_category: Record<string, number>;
}

// --- Group & Family Travel (Feature Blueprint P2 #21) ---
export type TripMemberRole = "OWNER" | "MEMBER";
export type TripMemberStatus = "INVITED" | "ACTIVE" | "LEFT";

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  status: TripMemberStatus;
  invited_at: string;
  joined_at: string | null;
}

export interface MemberLocation {
  member_id: string;
  user_id: string;
  location: GeoPoint;
  recorded_at: string;
  distance_from_centroid_meters: number | null;
  is_separated: boolean;
}

export interface GroupLocations {
  centroid: GeoPoint | null;
  members: MemberLocation[];
}

export interface GroupSafety {
  average_safety_score: number | null;
  members_covered: number;
  members_total: number;
  by_member: Record<string, number | null>;
}

// --- Live Location Sharing ---
export type LocationShareRecipientType = "TRUSTED_CONTACT" | "GROUP";
export type LocationSharePrecision = "PRECISE" | "APPROXIMATE";
export type LocationShareStatus = "ACTIVE" | "EXPIRED" | "REVOKED";
export type LocationShareDuration = "15m" | "1h" | "4h" | "until_trip_end" | "custom" | "until_stopped";

export interface LocationShare {
  id: string;
  user_id: string;
  recipient_type: LocationShareRecipientType;
  trusted_contact_id: string | null;
  trip_id: string | null;
  purpose: string | null;
  precision: LocationSharePrecision;
  status: LocationShareStatus;
  started_at: string;
  expires_at: string;
  last_location_at: string | null;
  current_location: GeoPoint | null;
  is_live: boolean;
  created_at: string;
  updated_at: string;
  // Populated ONLY in the create response — never re-fetchable, same rule
  // as Sos.trusted_contact_tokens' raw one-time token.
  access_token: string | null;
}

export interface LocationShareRecipientView {
  recipient_type: LocationShareRecipientType;
  precision: LocationSharePrecision;
  status: string;
  current_location: GeoPoint | null;
  last_location_at: string | null;
  is_live: boolean;
  expires_at: string;
  purpose: string | null;
  reason: string | null;
}

// --- Chat (conversations/messages — DIRECT/GROUP/TRIP) ---
export type ConversationType = "DIRECT" | "GROUP" | "TRIP";
export type ConversationMemberRole = "MEMBER" | "ADMIN" | "OWNER";
export type MessageType = "TEXT" | "LOCATION" | "SHARED_ENTITY" | "SYSTEM";
export type SharedEntityType = "itinerary_item" | "destination" | "trip";

export interface ConversationMember {
  user_id: string;
  role: ConversationMemberRole;
  status: "ACTIVE" | "LEFT";
  joined_at: string;
  last_read_message_id: string | null;
  is_online: boolean;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string | null;
  trip_id: string | null;
  creator_id: string;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string;
  updated_at: string;
  members: ConversationMember[];
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_message_id: string;
  content: string | null;
  message_type: MessageType;
  reply_to_message_id: string | null;
  reply_preview: string | null;
  shared_entity_type: string | null;
  shared_entity_id: string | null;
  location_share_id: string | null;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reactions: Record<string, string[]>;
  seen_by_count: number;
}

// --- Smart Heritage / Culture (Feature Blueprint P2 #7) ---
export interface TourismEvent {
  id: string;
  destination_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  expected_attendance: number | null;
}

export interface HeritageStory {
  story: string;
  grounded: boolean;
  sources: GuideAnswerSource[];
}

// --- Social Tourism (Feature Blueprint P2 #16) ---
export interface DiscussionPost {
  id: string;
  destination_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

// --- Destination "experience" (real weather + virtual-explore points) ---
export interface DestinationWeather {
  temperature_c: number | null;
  condition: string | null;
  is_day: boolean | null;
  observed_at: string | null;
}

export interface ExploreResult {
  destination_id: string;
  points_awarded: number;
  already_explored: boolean;
}

// --- Sustainability (Feature Blueprint P2 #12) ---
export interface OvertourismSignal {
  destination_id: string;
  latest_density: number | null;
  threshold: number;
  is_overtouristed: boolean;
  observed_at: string | null;
}

export interface CarbonFootprint {
  trip_id: string;
  total_distance_km: number;
  estimated_kg_co2: number;
  stops_counted: number;
  method: string;
}

export interface Availability {
  id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
}

export type BookingStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type TicketStatus = "ISSUED" | "CHECKED_IN" | "VOID";

export interface Ticket {
  id: string;
  qr_token: string;
  status: TicketStatus;
  checked_in_at: string | null;
}

export interface Booking {
  id: string;
  user_id: string;
  service_id: string;
  service_name: string;
  business_id: string;
  business_name: string;
  availability_id: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: BookingStatus;
  total_amount: number | null;
  currency: string;
  notes: string | null;
  created_at: string;
  ticket: Ticket | null;
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

export const api = {
  register: (body: { email: string; password: string; account_type: AccountType }) =>
    request<{ data: Me }>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(body) }).then(
      (r) => r.data
    ),

  login: (body: { email: string; password: string }) =>
    request<{ data: TokenPair }>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(body) }).then(
      (r) => r.data
    ),

  refresh: (refresh_token: string) =>
    request<{ data: TokenPair }>("/api/v1/auth/token/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }).then((r) => r.data),

  me: (token: string) => request<{ data: Me }>("/api/v1/users/me", { token }).then((r) => r.data),

  listConsents: (token: string) =>
    request<{ data: Consent[] }>("/api/v1/users/me/consents", { token }).then((r) => r.data),

  grantConsent: (body: { purpose: string; version: string }, token: string) =>
    request<{ data: Consent }>("/api/v1/users/me/consents", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  revokeConsent: (id: string, token: string) =>
    request<void>(`/api/v1/users/me/consents/${id}`, { method: "DELETE", token }),

  // limit=100 (the backend's real max page size, app/schemas/common.py's
  // MAX_PAGE_SIZE) rather than the 20-row default — every caller of this
  // treats the result as "every destination" (dropdowns, map views, the
  // browse grid), and silently only getting the first 20 of the real 60
  // seeded ones would be a real, confusing gap now that there are more
  // than a default page's worth.
  listDestinations: () =>
    request<{ data: Destination[] }>("/api/v1/destinations?limit=100").then((r) => r.data),

  getDestination: (id: string) =>
    request<{ data: Destination }>(`/api/v1/destinations/${id}`).then((r) => r.data),

  listAttractions: (destinationId: string) =>
    request<{ data: Attraction[] }>(`/api/v1/destinations/${destinationId}/attractions`).then((r) => r.data),

  listTrips: (token: string) => request<{ data: Trip[] }>("/api/v1/trips", { token }).then((r) => r.data),

  getTrip: (id: string, token: string) =>
    request<{ data: Trip }>(`/api/v1/trips/${id}`, { token }).then((r) => r.data),

  createTrip: (
    body: {
      title?: string;
      start_date?: string;
      end_date?: string;
      budget?: number;
      currency?: string;
      interests?: string[];
      avoid?: string[];
      pace?: TripPace;
      safety_preference?: SafetyPreference;
      days?: number;
      nights?: number;
    },
    token: string
  ) => request<{ data: Trip }>("/api/v1/trips", { method: "POST", body: JSON.stringify(body), token }).then(
    (r) => r.data
  ),

  updateTrip: (
    id: string,
    body: Partial<{
      title: string;
      status: string;
      is_public: boolean;
      interests: string[];
      avoid: string[];
      pace: TripPace;
      safety_preference: SafetyPreference;
      days: number;
      nights: number;
    }>,
    token: string
  ) =>
    request<{ data: Trip }>(`/api/v1/trips/${id}`, { method: "PATCH", body: JSON.stringify(body), token }).then(
      (r) => r.data
    ),

  listPublicTrips: () => request<{ data: Trip[] }>("/api/v1/trips/public").then((r) => r.data),

  cancelTrip: (id: string, token: string) =>
    request<void>(`/api/v1/trips/${id}`, { method: "DELETE", token }),

  // --- AI trip planning ---
  extractTripIntent: (prompt: string, token: string) =>
    request<{ data: TripIntentExtractResult }>("/api/v1/ai/trip-intent/extract", {
      method: "POST",
      body: JSON.stringify({ prompt }),
      token,
    }).then((r) => r.data),

  planTripWithAi: (
    body: {
      destination_id: string;
      prompt: string;
      start_date?: string;
      end_date?: string;
      budget?: number;
      currency?: string;
      traveler_type?: TravelerType;
      accessibility_needs?: AccessibilityNeed[];
      family_children_count?: number;
      family_seniors_count?: number;
      interests?: string[];
      avoid?: string[];
      pace?: TripPace;
      safety_preference?: SafetyPreference;
      days?: number;
      nights?: number;
    },
    token: string
  ) =>
    request<{ data: Itinerary }>("/api/v1/ai/trip-plan", { method: "POST", body: JSON.stringify(body), token }).then(
      (r) => r.data
    ),

  generateItinerary: (body: { trip_id: string; destination_id?: string; prompt: string }, token: string) =>
    request<{ data: Itinerary }>("/api/v1/ai/itinerary/generate", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  replanItinerary: (
    itineraryId: string,
    body: { reason: string; context?: Record<string, unknown>; quick_action?: QuickReplanAction },
    token: string
  ) =>
    request<{ data: Itinerary }>(`/api/v1/ai/itinerary/${itineraryId}/replan`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  getTripItinerary: (tripId: string, token: string) =>
    request<{ data: Itinerary }>(`/api/v1/trips/${tripId}/itinerary`, { token }).then((r) => r.data),

  updateItineraryItem: (
    tripId: string,
    itineraryId: string,
    itemId: string,
    body: { note?: string; completed?: boolean; base_item_version: number },
    token: string
  ) =>
    request<{ data: ItineraryItem }>(`/api/v1/trips/${tripId}/itinerary/${itineraryId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  // --- Adaptive journey engine ---
  listTripAdaptations: (tripId: string, token: string) =>
    request<{ data: AdaptationProposal[] }>(`/api/v1/trips/${tripId}/adaptations`, { token }).then((r) => r.data),

  checkTripAdaptations: (tripId: string, token: string) =>
    request<{ data: AdaptationProposal | null }>(`/api/v1/trips/${tripId}/adaptations/check`, {
      method: "POST",
      token,
    }).then((r) => r.data),

  acceptAdaptationProposal: (proposalId: string, token: string) =>
    request<{ data: AdaptationProposal }>(`/api/v1/adaptations/${proposalId}/accept`, {
      method: "POST",
      token,
    }).then((r) => r.data),

  rejectAdaptationProposal: (proposalId: string, token: string) =>
    request<{ data: AdaptationProposal }>(`/api/v1/adaptations/${proposalId}/reject`, {
      method: "POST",
      token,
    }).then((r) => r.data),

  // --- Offline sync ---
  sync: (body: { device_id: string; operations: SyncOperationIn[] }, token: string) =>
    request<{ data: SyncAck }>("/api/v1/sync", { method: "POST", body: JSON.stringify(body), token }).then(
      (r) => r.data
    ),

  getDestinationSafety: (id: string) =>
    request<{ data: SafetyScore | null }>(`/api/v1/destinations/${id}/safety`).then((r) => r.data),

  getDestinationCrowd: (id: string) =>
    request<{ data: CrowdCell[] }>(`/api/v1/destinations/${id}/crowd`).then((r) => r.data),

  // --- SOS ---
  createSos: (
    body: { lon: number; lat: number; emergency_type?: string; severity?: string },
    token: string
  ) =>
    request<{ data: Sos }>("/api/v1/sos", {
      method: "POST",
      body: JSON.stringify(body),
      token,
      headers: { "Idempotency-Key": idempotencyKey() },
    }).then((r) => r.data),

  listSos: (token: string) => request<{ data: Sos[] }>("/api/v1/sos", { token }).then((r) => r.data),

  getSos: (id: string, token: string) => request<{ data: Sos }>(`/api/v1/sos/${id}`, { token }).then((r) => r.data),

  acknowledgeSos: (id: string, token: string, note?: string) =>
    request<{ data: Sos }>(`/api/v1/sos/${id}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ note }),
      token,
    }).then((r) => r.data),

  resolveSos: (id: string, token: string, outcome: "RESOLVED" | "FALSE_ALARM" = "RESOLVED") =>
    request<{ data: Sos }>(`/api/v1/sos/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcome }),
      token,
    }).then((r) => r.data),

  cancelSos: (id: string, token: string) =>
    request<{ data: Sos }>(`/api/v1/sos/${id}/cancel`, { method: "POST", token }).then((r) => r.data),

  verifyTrustedContactToken: (sosId: string, token: string, otpCode?: string) =>
    request<{ data: { sos_id: string; status: string; emergency_type: string | null; created_at: string; precise_location: GeoPoint | null } }>(
      `/api/v1/sos/${sosId}/trusted-contact/verify`,
      { method: "POST", body: JSON.stringify({ token, otp_code: otpCode }) }
    ).then((r) => r.data),

  // --- Trusted contacts ---
  listTrustedContacts: (token: string) =>
    request<{ data: TrustedContact[] }>("/api/v1/users/me/trusted-contacts", { token }).then((r) => r.data),

  addTrustedContact: (
    body: { name: string; relationship_label?: string; phone?: string; email?: string },
    token: string
  ) =>
    request<{ data: TrustedContact }>("/api/v1/users/me/trusted-contacts", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  removeTrustedContact: (id: string, token: string) =>
    request<void>(`/api/v1/users/me/trusted-contacts/${id}`, { method: "DELETE", token }),

  // --- Live Location Sharing ---
  createLocationShare: (
    body: {
      recipient_type: LocationShareRecipientType;
      trusted_contact_id?: string;
      trip_id?: string;
      purpose?: string;
      precision: LocationSharePrecision;
      duration_choice: LocationShareDuration;
      custom_minutes?: number;
    },
    token: string
  ) =>
    request<{ data: LocationShare }>("/api/v1/location-sharing", {
      method: "POST",
      body: JSON.stringify(body),
      token,
      headers: { "Idempotency-Key": idempotencyKey() },
    }).then((r) => r.data),

  listLocationShares: (token: string) =>
    request<{ data: LocationShare[] }>("/api/v1/location-sharing", { token }).then((r) => r.data),

  getLocationShare: (id: string, token: string) =>
    request<{ data: LocationShare }>(`/api/v1/location-sharing/${id}`, { token }).then((r) => r.data),

  updateLocationShare: (
    id: string,
    body: { precision?: LocationSharePrecision; duration_choice?: LocationShareDuration; custom_minutes?: number },
    token: string
  ) =>
    request<{ data: LocationShare }>(`/api/v1/location-sharing/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  revokeLocationShare: (id: string, token: string) =>
    request<void>(`/api/v1/location-sharing/${id}`, { method: "DELETE", token }),

  stopAllLocationShares: (token: string) =>
    request<void>("/api/v1/location-sharing/stop-all", { method: "POST", token }),

  pingLocationShare: (id: string, body: { lon: number; lat: number; accuracy?: number }, token: string) =>
    request<{ data: LocationShare }>(`/api/v1/location-sharing/${id}/ping`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  // Public, unauthenticated — a trusted contact never has a platform
  // account, same reasoning as verifyTrustedContactToken. `accessToken` is
  // the share's own opaque link token (a query param here), never a Bearer
  // auth token, so it's deliberately NOT passed as `token` to `request()`.
  getLocationShareRecipientView: (shareId: string, accessToken: string) =>
    request<{ data: LocationShareRecipientView }>(
      `/api/v1/location-sharing/${shareId}/recipient-view?token=${encodeURIComponent(accessToken)}`
    ).then((r) => r.data),

  // --- Incidents ---
  createIncident: (
    body: { incident_type: string; severity: string; lon: number; lat: number; description?: string },
    token: string
  ) =>
    request<{ data: Incident }>("/api/v1/emergency/incidents", {
      method: "POST",
      body: JSON.stringify(body),
      token,
      headers: { "Idempotency-Key": idempotencyKey() },
    }).then((r) => r.data),

  listIncidents: (token: string) =>
    request<{ data: Incident[] }>("/api/v1/emergency/incidents", { token }).then((r) => r.data),

  assignIncident: (id: string, token: string) =>
    request<{ data: Incident }>(`/api/v1/emergency/incidents/${id}/assign`, { method: "POST", token }).then(
      (r) => r.data
    ),

  resolveIncident: (id: string, token: string, outcome: "RESOLVED" | "FALSE_ALARM" = "RESOLVED") =>
    request<{ data: Incident }>(`/api/v1/emergency/incidents/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcome }),
      token,
    }).then((r) => r.data),

  // --- Administration ---
  adminListUsers: (params: { q?: string; account_type?: string; limit?: number }, token: string) => {
    const q = new URLSearchParams();
    if (params.q) q.set("q", params.q);
    if (params.account_type) q.set("account_type", params.account_type);
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ data: AdminUser[] }>(`/api/v1/admin/users${qs ? `?${qs}` : ""}`, { token }).then((r) => r.data);
  },

  adminGetUser: (id: string, token: string) =>
    request<{ data: AdminUserDetail }>(`/api/v1/admin/users/${id}`, { token }).then((r) => r.data),

  adminChangeUserRole: (id: string, role: KnownRole, token: string) =>
    request<{ data: AdminUser }>(`/api/v1/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
      token,
    }).then((r) => r.data),

  adminChangeUserStatus: (id: string, status: AdminUser["status"], token: string) =>
    request<{ data: AdminUser }>(`/api/v1/admin/users/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
      token,
    }).then((r) => r.data),

  adminListAuditLog: (params: { resource_type?: string; limit?: number } | undefined, token: string) => {
    const q = new URLSearchParams();
    if (params?.resource_type) q.set("resource_type", params.resource_type);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ data: AuditLogEntry[] }>(`/api/v1/admin/audit-log${qs ? `?${qs}` : ""}`, { token }).then(
      (r) => r.data
    );
  },

  adminListPolicies: (token: string) =>
    request<{ data: PolicyRegistryEntry[] }>("/api/v1/admin/policies", { token }).then((r) => r.data),

  adminListRetentionRules: (token: string) =>
    request<{ data: RetentionRuleEntry[] }>("/api/v1/admin/retention-rules", { token }).then((r) => r.data),

  // --- Notifications ---
  listNotifications: (token: string) =>
    request<{ data: AppNotification[] }>("/api/v1/notifications", { token }).then((r) => r.data),

  markNotificationRead: (id: string, token: string) =>
    request<{ data: AppNotification }>(`/api/v1/notifications/${id}/read`, { method: "POST", token }).then(
      (r) => r.data
    ),

  getNotificationPreferences: (token: string) =>
    request<{ data: { preferences: Record<string, boolean> } }>("/api/v1/notifications/preferences", { token }).then(
      (r) => r.data
    ),

  setNotificationPreferences: (preferences: Record<string, boolean>, token: string) =>
    request<{ data: { preferences: Record<string, boolean> } }>("/api/v1/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify({ preferences }),
      token,
    }).then((r) => r.data),

  // --- Safe routing ---
  getRoute: (
    mode: "safe" | "crowd-free" | "accessible" | "emergency",
    body: { origin_lon: number; origin_lat: number; destination_lon: number; destination_lat: number }
  ) =>
    request<{ data: RouteResult }>(`/api/v1/routes/${mode}`, { method: "POST", body: JSON.stringify(body) }).then(
      (r) => r.data
    ),

  // --- Authority ---
  getAuthorityDashboard: (token: string) =>
    request<{ data: AuthorityDashboard }>("/api/v1/authority/dashboard", { token }).then((r) => r.data),

  // --- Business directory ---
  listBusinesses: (params?: {
    destination_id?: string;
    category?: BusinessCategory;
    verified_only?: boolean;
    dietary_option?: DietaryOption;
    cuisine?: string;
    accessible_only?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.destination_id) q.set("destination_id", params.destination_id);
    if (params?.category) q.set("category", params.category);
    if (params?.verified_only) q.set("verified_only", "true");
    if (params?.dietary_option) q.set("dietary_option", params.dietary_option);
    if (params?.cuisine) q.set("cuisine", params.cuisine);
    if (params?.accessible_only) q.set("accessible_only", "true");
    const qs = q.toString();
    return request<{ data: Business[] }>(`/api/v1/businesses${qs ? `?${qs}` : ""}`).then((r) => r.data);
  },

  getBusiness: (id: string) => request<{ data: Business }>(`/api/v1/businesses/${id}`).then((r) => r.data),

  listMyBusinesses: (token: string) =>
    request<{ data: Business[] }>("/api/v1/businesses/mine", { token }).then((r) => r.data),

  createBusiness: (
    body: { name: string; category: BusinessCategory; destination_id?: string; lon?: number; lat?: number },
    token: string
  ) =>
    request<{ data: Business }>("/api/v1/businesses", { method: "POST", body: JSON.stringify(body), token }).then(
      (r) => r.data
    ),

  upsertBusinessProfile: (
    id: string,
    body: {
      description?: string;
      image_url?: string | null;
      contact_info?: Record<string, unknown>;
      accessibility_features?: Record<string, unknown>;
      cuisines?: string[];
      dietary_options?: DietaryOption[];
      price_range?: PriceRange | null;
    },
    token: string
  ) =>
    request<{ data: Business }>(`/api/v1/businesses/${id}/profile`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  listServices: (businessId: string) =>
    request<{ data: Service[] }>(`/api/v1/businesses/${businessId}/services`).then((r) => r.data),

  createService: (
    businessId: string,
    body: {
      name: string;
      description?: string;
      base_price?: number;
      currency?: string;
      origin_destination_id?: string;
      destination_destination_id?: string;
    },
    token: string
  ) =>
    request<{ data: Service }>(`/api/v1/businesses/${businessId}/services`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  searchTransport: (params: {
    category: BusinessCategory;
    origin_destination_id?: string;
    destination_destination_id?: string;
  }) => {
    const query = new URLSearchParams({ category: params.category });
    if (params.origin_destination_id) query.set("origin_destination_id", params.origin_destination_id);
    if (params.destination_destination_id) query.set("destination_destination_id", params.destination_destination_id);
    return request<{ data: TransportSearchResult[] }>(`/api/v1/services/search?${query.toString()}`).then(
      (r) => r.data
    );
  },

  // --- Guides ---
  listGuides: (params?: { destination_id?: string; verified_only?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.destination_id) q.set("destination_id", params.destination_id);
    if (params?.verified_only) q.set("verified_only", "true");
    const qs = q.toString();
    return request<{ data: Guide[] }>(`/api/v1/guides${qs ? `?${qs}` : ""}`).then((r) => r.data);
  },

  getGuide: (id: string) => request<{ data: Guide }>(`/api/v1/guides/${id}`).then((r) => r.data),

  listMyGuides: (token: string) => request<{ data: Guide[] }>("/api/v1/guides/mine", { token }).then((r) => r.data),

  createGuide: (
    body: { languages?: string[]; specialties?: string[]; destination_id?: string; bio?: string },
    token: string
  ) => request<{ data: Guide }>("/api/v1/guides", { method: "POST", body: JSON.stringify(body), token }).then((r) => r.data),

  updateGuide: (
    id: string,
    body: { languages?: string[]; specialties?: string[]; destination_id?: string; bio?: string },
    token: string
  ) =>
    request<{ data: Guide }>(`/api/v1/guides/${id}`, { method: "PUT", body: JSON.stringify(body), token }).then(
      (r) => r.data
    ),

  // --- Trust: verifications ---
  submitVerification: (body: { subject_type: VerificationSubjectType; subject_id: string }, token: string) =>
    request<{ data: Verification }>("/api/v1/trust/verifications", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  listVerifications: (token: string, status?: VerificationStatus) =>
    request<{ data: Verification[] }>(`/api/v1/trust/verifications${status ? `?status=${status}` : ""}`, {
      token,
    }).then((r) => r.data),

  approveVerification: (id: string, token: string) =>
    request<{ data: Verification }>(`/api/v1/trust/verifications/${id}/approve`, { method: "POST", token }).then(
      (r) => r.data
    ),

  rejectVerification: (id: string, reason: string, token: string) =>
    request<{ data: Verification }>(`/api/v1/trust/verifications/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      token,
    }).then((r) => r.data),

  // --- Trust: reviews ---
  listReviews: (targetType: ReviewTargetType, targetId: string, token: string) =>
    request<{ data: Review[] }>(`/api/v1/trust/reviews?target_type=${targetType}&target_id=${targetId}`, {
      token,
    }).then((r) => r.data),

  createReview: (body: { target_type: ReviewTargetType; target_id: string; rating: number; body?: string }, token: string) =>
    request<{ data: Review }>("/api/v1/trust/reviews", { method: "POST", body: JSON.stringify(body), token }).then(
      (r) => r.data
    ),

  listMyReviews: (token: string) =>
    request<{ data: Review[] }>("/api/v1/trust/reviews/mine", { token }).then((r) => r.data),

  // --- Trust: fraud cases ---
  reportFraudCase: (body: { subject_type: string; subject_id?: string; description: string }, token: string) =>
    request<{ data: FraudCase }>("/api/v1/trust/fraud-cases", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  listFraudCases: (token: string) =>
    request<{ data: FraudCase[] }>("/api/v1/trust/fraud-cases", { token }).then((r) => r.data),

  resolveFraudCase: (id: string, outcome: "CONFIRMED" | "DISMISSED", token: string) =>
    request<{ data: FraudCase }>(`/api/v1/trust/fraud-cases/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcome }),
      token,
    }).then((r) => r.data),

  // --- AI Tourist Guide + Translation ---
  askTouristGuide: (body: { question: string; destination_id?: string }, token: string) =>
    request<{ data: GuideAnswer }>("/api/v1/ai/guide/ask", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  translateText: (body: { text: string; target_language: string }, token: string) =>
    request<{ data: { translated_text: string } }>("/api/v1/ai/translate", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  translateImage: (body: { image_base64: string; media_type: string; target_language: string }, token: string) =>
    request<{ data: { translated_text: string } }>("/api/v1/ai/translate/image", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  // --- Availability (time-slot booking) ---
  listAvailability: (serviceId: string) =>
    request<{ data: Availability[] }>(`/api/v1/services/${serviceId}/availability`).then((r) => r.data),

  createAvailability: (
    serviceId: string,
    body: { starts_at: string; ends_at: string; capacity?: number },
    token: string
  ) =>
    request<{ data: Availability }>(`/api/v1/services/${serviceId}/availability`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  // --- Bookings & tickets ---
  createBooking: (
    body: { service_id: string; availability_id: string; party_size?: number; notes?: string },
    token: string
  ) =>
    request<{ data: Booking }>("/api/v1/bookings", {
      method: "POST",
      body: JSON.stringify(body),
      token,
      headers: { "Idempotency-Key": idempotencyKey() },
    }).then((r) => r.data),

  listBookings: (token: string) => request<{ data: Booking[] }>("/api/v1/bookings", { token }).then((r) => r.data),

  listBusinessBookings: (businessId: string, token: string) =>
    request<{ data: Booking[] }>(`/api/v1/bookings/business/${businessId}`, { token }).then((r) => r.data),

  cancelBooking: (id: string, token: string) =>
    request<{ data: Booking }>(`/api/v1/bookings/${id}/cancel`, { method: "POST", token }).then((r) => r.data),

  verifyTicket: (qrToken: string, token: string) =>
    request<{ data: Booking }>("/api/v1/tickets/verify", {
      method: "POST",
      body: JSON.stringify({ qr_token: qrToken }),
      token,
    }).then((r) => r.data),

  // --- Accessibility (FR-22) ---
  listFacilities: (destinationId: string, facilityType?: FacilityType) =>
    request<{ data: Facility[] }>(
      `/api/v1/destinations/${destinationId}/facilities${facilityType ? `?facility_type=${facilityType}` : ""}`
    ).then((r) => r.data),

  createFacility: (
    destinationId: string,
    body: { name: string; facility_type: FacilityType; lon: number; lat: number },
    token: string
  ) =>
    request<{ data: Facility }>(`/api/v1/destinations/${destinationId}/facilities`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  getAccessibilityPreferences: (token: string) =>
    request<{ data: AccessibilityPreferences }>("/api/v1/users/me/accessibility-preferences", { token }).then(
      (r) => r.data
    ),

  setAccessibilityPreferences: (body: AccessibilityPreferences, token: string) =>
    request<{ data: AccessibilityPreferences }>("/api/v1/users/me/accessibility-preferences", {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  getTravelPreferences: (token: string) =>
    request<{ data: TravelPreferences }>("/api/v1/users/me/travel-preferences", { token }).then((r) => r.data),

  setTravelPreferences: (body: TravelPreferences, token: string) =>
    request<{ data: TravelPreferences }>("/api/v1/users/me/travel-preferences", {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  setLanguagePreference: (preferredLanguage: string | null, token: string) =>
    request<{ data: { preferred_language: string | null } }>("/api/v1/users/me/language", {
      method: "PUT",
      body: JSON.stringify({ preferred_language: preferredLanguage }),
      token,
    }).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string, token: string) =>
    request<void>("/api/v1/users/me/password", {
      method: "PUT",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      token,
    }),

  // --- Predictive tourism (FR-33) ---
  getDemandForecast: (destinationId: string) =>
    request<{ data: DemandForecast }>(`/api/v1/destinations/${destinationId}/demand-forecast`).then((r) => r.data),

  // --- Tourism analytics (FR-39) ---
  getAnalyticsOverview: (token: string) =>
    request<{ data: AnalyticsOverview }>("/api/v1/analytics/overview", { token }).then((r) => r.data),

  getTrendingDestinations: (token: string) =>
    request<{ data: TrendingDestination[] }>("/api/v1/analytics/trending-destinations", { token }).then(
      (r) => r.data
    ),

  getFeatureAdoption: (token: string) =>
    request<{ data: FeatureAdoption }>("/api/v1/analytics/feature-adoption", { token }).then((r) => r.data),

  // --- Gamification ---
  listBadges: () => request<{ data: Badge[] }>("/api/v1/gamification/badges").then((r) => r.data),

  listChallenges: (token: string) =>
    request<{ data: Challenge[] }>("/api/v1/gamification/challenges", { token }).then((r) => r.data),

  getMyGamification: (token: string) =>
    request<{ data: MeGamification }>("/api/v1/gamification/me", { token }).then((r) => r.data),

  getLeaderboard: (category?: GamificationCategory) =>
    request<{ data: LeaderboardEntry[] }>(
      `/api/v1/gamification/leaderboard${category ? `?category=${category}` : ""}`
    ).then((r) => r.data),

  getMyLeaderboardRank: (category: GamificationCategory | undefined, token: string) =>
    request<{ data: MyRank }>(
      `/api/v1/gamification/leaderboard/me${category ? `?category=${category}` : ""}`,
      { token }
    ).then((r) => r.data),

  listMyPointsHistory: (token: string) =>
    request<{ data: PointsHistoryEntry[] }>("/api/v1/gamification/points/history", { token }).then((r) => r.data),

  listMyCheckIns: (token: string) =>
    request<{ data: VisitedDestination[] }>("/api/v1/gamification/check-ins", { token }).then((r) => r.data),

  checkIn: (body: { destination_id: string; lon: number; lat: number }, token: string) =>
    request<{ data: CheckIn }>("/api/v1/gamification/check-ins", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  // --- Lost & Found ---
  reportLostItem: (
    body: {
      category: LostFoundCategory;
      title: string;
      description: string;
      lost_at: string;
      destination_id?: string;
      lon?: number;
      lat?: number;
    },
    token: string
  ) =>
    request<{ data: LostItem }>("/api/v1/lost-found/lost-items", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  listMyLostItems: (token: string) =>
    request<{ data: LostItem[] }>("/api/v1/lost-found/lost-items", { token }).then((r) => r.data),

  reportFoundItem: (
    body: {
      category: LostFoundCategory;
      title: string;
      description: string;
      found_at: string;
      destination_id?: string;
      lon?: number;
      lat?: number;
      storage_location?: string;
    },
    token: string
  ) =>
    request<{ data: FoundItem }>("/api/v1/lost-found/found-items", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  listFoundItems: () => request<{ data: FoundItem[] }>("/api/v1/lost-found/found-items").then((r) => r.data),

  listMyFoundItems: (token: string) =>
    request<{ data: FoundItem[] }>("/api/v1/lost-found/found-items/mine", { token }).then((r) => r.data),

  markFoundItemReturned: (foundItemId: string, token: string) =>
    request<{ data: FoundItem }>(`/api/v1/lost-found/found-items/${foundItemId}/mark-returned`, {
      method: "POST",
      token,
    }).then((r) => r.data),

  listMatchesForLostItem: (lostItemId: string, token: string) =>
    request<{ data: LostFoundMatchEntry[] }>(`/api/v1/lost-found/lost-items/${lostItemId}/matches`, { token }).then(
      (r) => r.data
    ),

  confirmMatch: (matchId: string, token: string) =>
    request<{ data: LostFoundMatchEntry }>(`/api/v1/lost-found/matches/${matchId}/confirm`, {
      method: "POST",
      token,
    }).then((r) => r.data),

  rejectMatch: (matchId: string, token: string) =>
    request<{ data: LostFoundMatchEntry }>(`/api/v1/lost-found/matches/${matchId}/reject`, {
      method: "POST",
      token,
    }).then((r) => r.data),

  // --- Financial Intelligence ---
  createExpense: (
    body: {
      trip_id?: string;
      category: ExpenseCategory;
      amount: number;
      currency?: string;
      description?: string;
      incurred_at: string;
      source?: ExpenseSource;
    },
    token: string
  ) =>
    request<{ data: Expense }>("/api/v1/financial/expenses", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  listExpenses: (token: string, tripId?: string) =>
    request<{ data: Expense[] }>(`/api/v1/financial/expenses${tripId ? `?trip_id=${tripId}` : ""}`, { token }).then(
      (r) => r.data
    ),

  deleteExpense: (id: string, token: string) =>
    request<void>(`/api/v1/financial/expenses/${id}`, { method: "DELETE", token }),

  scanReceipt: (body: { image_base64: string; media_type: string }, token: string) =>
    request<{ data: ReceiptScanResult }>("/api/v1/financial/receipts/scan", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  getTripFinancialSummary: (tripId: string, token: string) =>
    request<{ data: TripFinancialSummary }>(`/api/v1/financial/trips/${tripId}/summary`, { token }).then(
      (r) => r.data
    ),

  // --- Group & Family Travel ---
  inviteTripMember: (tripId: string, email: string, token: string) =>
    request<{ data: TripMember }>(`/api/v1/group-travel/trips/${tripId}/members`, {
      method: "POST",
      body: JSON.stringify({ email }),
      token,
    }).then((r) => r.data),

  listTripMembers: (tripId: string, token: string) =>
    request<{ data: TripMember[] }>(`/api/v1/group-travel/trips/${tripId}/members`, { token }).then((r) => r.data),

  acceptTripInvite: (memberId: string, token: string) =>
    request<{ data: TripMember }>(`/api/v1/group-travel/members/${memberId}/accept`, { method: "POST", token }).then(
      (r) => r.data
    ),

  leaveTripGroup: (memberId: string, token: string) =>
    request<{ data: TripMember }>(`/api/v1/group-travel/members/${memberId}/leave`, { method: "POST", token }).then(
      (r) => r.data
    ),

  updateMyTripLocation: (tripId: string, body: { lon: number; lat: number }, token: string) =>
    request<{ data: MemberLocation }>(`/api/v1/group-travel/trips/${tripId}/location`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  getGroupLocations: (tripId: string, token: string) =>
    request<{ data: GroupLocations }>(`/api/v1/group-travel/trips/${tripId}/locations`, { token }).then(
      (r) => r.data
    ),

  getGroupSafety: (tripId: string, token: string) =>
    request<{ data: GroupSafety }>(`/api/v1/group-travel/trips/${tripId}/safety`, { token }).then((r) => r.data),

  // --- Chat ---
  listConversations: (token: string) =>
    request<{ data: Conversation[] }>("/api/v1/conversations", { token }).then((r) => r.data),

  createConversation: (
    body: { type: "DIRECT" | "GROUP"; member_user_ids?: string[]; title?: string },
    token: string
  ) =>
    request<{ data: Conversation }>("/api/v1/conversations", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  getConversation: (conversationId: string, token: string) =>
    request<{ data: Conversation }>(`/api/v1/conversations/${conversationId}`, { token }).then((r) => r.data),

  getOrCreateTripConversation: (tripId: string, token: string) =>
    request<{ data: Conversation }>(`/api/v1/trips/${tripId}/conversation`, { token }).then((r) => r.data),

  addConversationMembers: (conversationId: string, memberUserIds: string[], token: string) =>
    request<{ data: Conversation }>(`/api/v1/conversations/${conversationId}/members`, {
      method: "POST",
      body: JSON.stringify(memberUserIds),
      token,
    }).then((r) => r.data),

  removeConversationMember: (conversationId: string, memberUserId: string, token: string) =>
    request<void>(`/api/v1/conversations/${conversationId}/members/${memberUserId}`, { method: "DELETE", token }),

  listMessages: (conversationId: string, token: string, params?: { cursor?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return request<{ data: ChatMessage[]; meta: { next_cursor: string | null; has_more: boolean } }>(
      `/api/v1/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
      { token }
    );
  },

  sendMessage: (
    conversationId: string,
    body: {
      client_message_id: string;
      content?: string;
      message_type?: MessageType;
      reply_to_message_id?: string;
      shared_entity_type?: SharedEntityType;
      shared_entity_id?: string;
      location_share_id?: string;
      mentions?: string[];
    },
    token: string
  ) =>
    request<{ data: ChatMessage }>(`/api/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }).then((r) => r.data),

  editMessage: (messageId: string, content: string, token: string) =>
    request<{ data: ChatMessage }>(`/api/v1/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
      token,
    }).then((r) => r.data),

  deleteMessage: (messageId: string, token: string) =>
    request<void>(`/api/v1/messages/${messageId}`, { method: "DELETE", token }),

  addReaction: (messageId: string, emoji: string, token: string) =>
    request<{ data: ChatMessage }>(`/api/v1/messages/${messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
      token,
    }).then((r) => r.data),

  removeReaction: (messageId: string, emoji: string, token: string) =>
    request<{ data: ChatMessage }>(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: "DELETE",
      token,
    }).then((r) => r.data),

  reportMessage: (messageId: string, reason: string, token: string) =>
    request<{ data: { report_id: string } }>(`/api/v1/messages/${messageId}/report`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      token,
    }).then((r) => r.data),

  markConversationRead: (conversationId: string, messageId: string, token: string) =>
    request<void>(`/api/v1/conversations/${conversationId}/read`, {
      method: "POST",
      body: JSON.stringify({ message_id: messageId }),
      token,
    }),

  blockUser: (userId: string, token: string) => request<void>(`/api/v1/users/${userId}/block`, { method: "POST", token }),

  unblockUser: (userId: string, token: string) =>
    request<void>(`/api/v1/users/${userId}/block`, { method: "DELETE", token }),

  // --- Smart Heritage / Culture ---
  listTourismEvents: (destinationId: string) =>
    request<{ data: TourismEvent[] }>(`/api/v1/destinations/${destinationId}/events`).then((r) => r.data),

  getHeritageStory: (destinationId: string, token: string) =>
    request<{ data: HeritageStory }>("/api/v1/ai/heritage/story", {
      method: "POST",
      body: JSON.stringify({ destination_id: destinationId }),
      token,
    }).then((r) => r.data),

  // --- Social Tourism ---
  listDiscussionPosts: (destinationId: string) =>
    request<{ data: DiscussionPost[] }>(`/api/v1/social/destinations/${destinationId}/discussions`).then(
      (r) => r.data
    ),

  createDiscussionPost: (destinationId: string, body: string, token: string) =>
    request<{ data: DiscussionPost }>(`/api/v1/social/destinations/${destinationId}/discussions`, {
      method: "POST",
      body: JSON.stringify({ body }),
      token,
    }).then((r) => r.data),

  getDestinationWeather: (destinationId: string) =>
    request<{ data: DestinationWeather }>(`/api/v1/destinations/${destinationId}/weather`).then((r) => r.data),

  exploreDestination: (destinationId: string, token: string) =>
    request<{ data: ExploreResult }>(`/api/v1/destinations/${destinationId}/explore`, {
      method: "POST",
      token,
    }).then((r) => r.data),

  // --- Sustainability ---
  getOvertourismSignal: (destinationId: string) =>
    request<{ data: OvertourismSignal }>(`/api/v1/destinations/${destinationId}/overtourism`).then((r) => r.data),

  getTripCarbonFootprint: (tripId: string, token: string) =>
    request<{ data: CarbonFootprint }>(`/api/v1/trips/${tripId}/carbon-footprint`, { token }).then((r) => r.data),

  // --- Crowd heatmap ---
  getCrowdHeatmap: () =>
    request<{ data: CrowdHeatmapPoint[] }>("/api/v1/crowd/heatmap").then((r) => r.data),

  getCrowdRiskRanking: () =>
    request<{ data: CrowdHeatmapPoint[] }>("/api/v1/crowd/risk").then((r) => r.data),
};
