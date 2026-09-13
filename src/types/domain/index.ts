import type * as Api from '@/types/api';
import type { Camelize } from './case';

export type { Camelize, Snakeize } from './case';

/*
 * Canonical frontend domain types. Each mirrors its wire DTO in camelCase so
 * components never see transport naming. Client-only states (e.g. a message
 * that is still sending) are modelled explicitly below.
 */

export type User = Camelize<Api.UserDto>;
export type UserRole = Api.UserRole;
export type Session = Camelize<Api.SessionDto>;
export type Profile = Camelize<Api.ProfileDto>;
export type ProfileUpdate = Camelize<Api.ProfileUpdateDto>;
export type TravelPreferences = Camelize<Api.TravelPreferencesDto>;
export type AccessibilityNeeds = Camelize<Api.AccessibilityNeedsDto>;
export type SafetyPreferences = Camelize<Api.SafetyPreferencesDto>;
export type NotificationPreferences = Camelize<Api.NotificationPreferencesDto>;
export type FoodPreferences = Camelize<Api.FoodPreferencesDto>;
export type Consent = Camelize<Api.ConsentDto>;
export type DataRequest = Camelize<Api.DataRequestDto>;

export type Money = Camelize<Api.MoneyDto>;
export type Cost = Camelize<Api.CostDto>;
export type Freshness = Camelize<Api.FreshnessDto>;
export type Reason = Camelize<Api.ReasonDto>;
export type Image = Camelize<Api.ImageDto>;
export type GeoPoint = Camelize<Api.GeoPointDto>;
export type Page<T> = { items: T[]; nextCursor: string | null; total?: number | null };

export type DestinationSummary = Camelize<Api.DestinationSummaryDto>;
export type Destination = Camelize<Api.DestinationDto>;
export type Attraction = Camelize<Api.AttractionDto>;
export type Advisory = Camelize<Api.AdvisoryDto>;
export type ConditionSignal = Camelize<Api.ConditionSignalDto>;
export type SearchResult = Camelize<Api.SearchResultDto>;
export type SearchResponse = Camelize<Api.SearchResponseDto>;

export type Business = Camelize<Api.BusinessDto>;
export type Guide = Camelize<Api.GuideDto>;
export type Service = Camelize<Api.ServiceDto>;
export type ServiceUnit = Api.ServiceUnit;
export type PackageDetails = Camelize<Api.PackageDetailsDto>;
export type Review = Camelize<Api.ReviewDto>;
export type VerificationEvidence = Camelize<Api.VerificationEvidenceDto>;
export type Reputation = Camelize<Api.ReputationDto>;
export type Availability = Camelize<Api.AvailabilityDto>;
export type VerificationLookup = Camelize<Api.VerificationLookupDto>;
export type FraudReport = Camelize<Api.FraudReportDto>;
export type FraudReportInput = Camelize<Api.FraudReportRequestDto>;

export type Trip = Camelize<Api.TripDto>;
export type TripSummary = Camelize<Api.TripSummaryDto>;
export type TripMember = Camelize<Api.TripMemberDto>;
export type TripIntent = Camelize<Api.TripIntentInputDto>;
export type TripIntentField = keyof TripIntent;
export type Travellers = Camelize<Api.TravellersDto>;
export type Budget = Camelize<Api.BudgetDto>;
export type IntentExtraction = Camelize<Api.IntentExtractionDto>;
export type Ambiguity = Camelize<Api.AmbiguityDto>;
export type GenerationJob = Camelize<Api.GenerationJobDto>;
export type GenerationStage = Api.GenerationStage;
export type HomeSummary = Camelize<Api.HomeSummaryDto>;

export type Itinerary = Camelize<Api.ItineraryDto>;
export type ItineraryDay = Camelize<Api.ItineraryDayDto>;
export type ItineraryItem = Camelize<Api.ItineraryItemDto>;
export type ItineraryVersion = Camelize<Api.ItineraryVersionDto>;
export type BudgetSummary = Camelize<Api.BudgetSummaryDto>;
export type PlaceRef = Camelize<Api.PlaceRefDto>;

export type AdaptationEvent = Camelize<Api.AdaptationEventDto>;
export type AdaptationProposal = Camelize<Api.AdaptationProposalDto>;
export type AdaptationChange = Camelize<Api.AdaptationChangeDto>;
export type AdaptationStatus = Api.AdaptationStatus;
export type ImpactSummary = Camelize<Api.ImpactSummaryDto>;
export type ReplanRequest = Camelize<Api.ReplanRequestDto>;
export type ReplanPreset = Api.ReplanPreset;

export type RouteOption = Camelize<Api.RouteOptionDto>;
export type RoutePlan = Camelize<Api.RoutePlanResponseDto>;
export type RoutePlanRequest = Camelize<Api.RoutePlanRequestDto>;
export type MapLayers = Camelize<Api.MapLayersResponseDto>;
export type MapLayerId = Api.MapLayerId;
export type SafetyZone = Camelize<Api.SafetyZoneDto>;
export type CrowdSignal = Camelize<Api.CrowdSignalDto>;

export type SafetyContext = Camelize<Api.SafetyContextDto>;
export type Incident = Camelize<Api.IncidentDto>;
export type IncidentReportInput = Camelize<Api.IncidentReportRequestDto>;
export type SosAlert = Camelize<Api.SosAlertDto>;
export type SosInput = Camelize<Api.SosCreateRequestDto>;
export type TrustedContact = Camelize<Api.TrustedContactDto>;
export type TrustedContactInput = Camelize<Api.TrustedContactInputDto>;
export type CheckIn = Camelize<Api.CheckInDto>;
export type HelpPoint = Camelize<Api.HelpPointDto>;

export type LocationShare = Camelize<Api.LocationShareDto>;
export type LocationUpdate = Camelize<Api.LocationUpdateDto>;
export type LocationShareInput = Camelize<Api.CreateLocationShareRequestDto>;
export type LocationShareHistoryItem = Camelize<Api.LocationShareHistoryItemDto>;

export type Conversation = Camelize<Api.ConversationDto>;
export type ConversationMember = Camelize<Api.ConversationMemberDto>;
export type Message = Camelize<Api.MessageDto>;
export type MessageCard = Camelize<Api.MessageCardDto>;
export type Reaction = Camelize<Api.ReactionDto>;
export type SendMessageInput = Camelize<Api.SendMessageRequestDto>;

/** A message as the UI renders it: server-confirmed, or local and pending. */
export type ChatMessage =
  | (Message & { delivery: 'server' })
  | (Omit<Message, 'status' | 'messageId' | 'createdAt'> & {
      delivery: 'local';
      messageId: string;
      createdAt: string;
      /** Local lifecycle before the server confirms. */
      status: 'sending' | 'failed' | 'draft';
    });

export type Booking = Camelize<Api.BookingDto>;
export type BookingQuote = Camelize<Api.BookingQuoteDto>;
export type BookingQuoteInput = Camelize<Api.BookingQuoteRequestDto>;
export type BookingInput = Camelize<Api.CreateBookingRequestDto>;
export type BookingStatus = Api.BookingStatus;
export type Ticket = Camelize<Api.TicketDto>;
export type RecommendedOffer = Camelize<Api.RecommendedOfferDto>;
export type RecommendedOfferKind = Api.RecommendedOfferKind;
export type TripBookingRecommendations = Camelize<Api.TripBookingRecommendationsDto>;

export type Notification = Camelize<Api.NotificationDto>;
export type NotificationTarget = Camelize<Api.NotificationTargetDto>;

export type CommunityChannel = Camelize<Api.CommunityChannelDto>;
export type CommunityPost = Camelize<Api.CommunityPostDto>;
export type CommunityPostInput = Camelize<Api.CreateCommunityPostRequestDto>;

export type AuthorityOverview = Camelize<Api.AuthorityOverviewDto>;
export type AuthoritySosItem = Camelize<Api.AuthoritySosItemDto>;
export type AuthorityIncident = Camelize<Api.AuthorityIncidentDto>;
export type VerificationRequest = Camelize<Api.VerificationRequestDto>;
export type AuthorityAnalytics = Camelize<Api.AuthorityAnalyticsDto>;
export type AnalyticsSeries = Camelize<Api.AnalyticsSeriesDto>;

export type PartnerDashboard = Camelize<Api.PartnerDashboardDto>;
export type PartnerProfile = Camelize<Api.PartnerProfileDto>;
export type AvailabilitySlot = Camelize<Api.AvailabilitySlotDto>;
export type Complaint = Camelize<Api.ComplaintDto>;

export type Capabilities = Camelize<Api.CapabilitiesDto>;
export type PlatformMetrics = Camelize<Api.PlatformMetricsDto>;
