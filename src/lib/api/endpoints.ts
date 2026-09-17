/**
 * Every backend path the frontend calls, in one place. Components and pages
 * never build URLs; repositories import from here. Paths are documented in
 * FRONTEND_BACKEND_CONTRACT.md and can be remapped here without touching UI.
 */

const e = encodeURIComponent;

export const endpoints = {
  platform: {
    capabilities: '/v1/capabilities',
    metrics: '/v1/metrics/platform',
  },
  auth: {
    session: '/v1/auth/session',
    login: '/v1/auth/login',
    register: '/v1/auth/register',
    logout: '/v1/auth/logout',
    refresh: '/v1/auth/refresh',
  },
  me: {
    profile: '/v1/me/profile',
    home: '/v1/me/home',
    consents: '/v1/me/consents',
    consent: (consentId: string) => `/v1/me/consents/${e(consentId)}`,
    dataRequests: '/v1/me/data-requests',
  },
  search: '/v1/search',
  destinations: {
    list: '/v1/destinations',
    detail: (slug: string) => `/v1/destinations/${e(slug)}`,
    communityChannels: (destinationId: string) => `/v1/destinations/${e(destinationId)}/community/channels`,
  },
  community: {
    posts: (channelId: string) => `/v1/community/channels/${e(channelId)}/posts`,
    helpful: (postId: string) => `/v1/community/posts/${e(postId)}/helpful`,
  },
  trips: {
    list: '/v1/trips',
    create: '/v1/trips',
    detail: (tripId: string) => `/v1/trips/${e(tripId)}`,
    extractIntent: '/v1/trip-intents/extract',
    generate: (tripId: string) => `/v1/trips/${e(tripId)}/itinerary/generate`,
    generationJob: (jobId: string) => `/v1/itinerary-jobs/${e(jobId)}`,
    bookingRecommendations: (tripId: string) => `/v1/trips/${e(tripId)}/booking-recommendations`,
  },
  itineraries: {
    current: (tripId: string) => `/v1/trips/${e(tripId)}/itinerary`,
    versions: (tripId: string) => `/v1/trips/${e(tripId)}/itinerary/versions`,
    version: (tripId: string, version: number) => `/v1/trips/${e(tripId)}/itinerary/versions/${version}`,
  },
  adaptations: {
    forTrip: (tripId: string) => `/v1/trips/${e(tripId)}/adaptations`,
    detail: (proposalId: string) => `/v1/adaptations/${e(proposalId)}`,
    accept: (proposalId: string) => `/v1/adaptations/${e(proposalId)}/accept`,
    reject: (proposalId: string) => `/v1/adaptations/${e(proposalId)}/reject`,
    replan: (tripId: string) => `/v1/trips/${e(tripId)}/replan`,
  },
  routes: {
    plan: '/v1/routes/plan',
  },
  map: {
    layers: '/v1/map/layers',
  },
  safety: {
    context: '/v1/safety/context',
    incidents: '/v1/safety/incidents',
    reports: '/v1/safety/reports',
    trustedContacts: '/v1/safety/trusted-contacts',
    trustedContact: (contactId: string) => `/v1/safety/trusted-contacts/${e(contactId)}`,
    checkIns: '/v1/safety/check-ins',
    checkIn: (checkInId: string) => `/v1/safety/check-ins/${e(checkInId)}`,
  },
  sos: {
    create: '/v1/sos',
    active: '/v1/sos/active',
    detail: (alertId: string) => `/v1/sos/${e(alertId)}`,
    cancel: (alertId: string) => `/v1/sos/${e(alertId)}/cancel`,
  },
  location: {
    shares: '/v1/location-shares',
    share: (shareId: string) => `/v1/location-shares/${e(shareId)}`,
    updates: (shareId: string) => `/v1/location-shares/${e(shareId)}/updates`,
    stopAll: '/v1/location-shares/stop-all',
    visible: '/v1/location-shares/visible',
    history: '/v1/location-shares/history',
  },
  chat: {
    conversations: '/v1/conversations',
    conversation: (conversationId: string) => `/v1/conversations/${e(conversationId)}`,
    messages: (conversationId: string) => `/v1/conversations/${e(conversationId)}/messages`,
    read: (conversationId: string) => `/v1/conversations/${e(conversationId)}/read`,
    reactions: (conversationId: string, messageId: string) =>
      `/v1/conversations/${e(conversationId)}/messages/${e(messageId)}/reactions`,
  },
  bookings: {
    list: '/v1/bookings',
    quotes: '/v1/bookings/quotes',
    create: '/v1/bookings',
    detail: (bookingId: string) => `/v1/bookings/${e(bookingId)}`,
    cancel: (bookingId: string) => `/v1/bookings/${e(bookingId)}/cancel`,
  },
  /** See `src/types/api/transport.ts` for which of these the backend serves today. */
  transport: {
    /** Flights, buses and trains: the backend's own transport search. */
    search: '/v1/services/search',
    places: '/v1/transport/places',
    quotes: '/v1/transport/quotes',
    metroNetworks: '/v1/transport/metro/networks',
    metroNetwork: (networkId: string) => `/v1/transport/metro/networks/${e(networkId)}`,
    metroFare: '/v1/transport/metro/fare',
    cabPlaces: '/v1/transport/cabs/places',
    cabOptions: '/v1/transport/cabs/options',
  },
  businesses: {
    list: '/v1/businesses',
    detail: (businessId: string) => `/v1/businesses/${e(businessId)}`,
    reviews: (businessId: string) => `/v1/businesses/${e(businessId)}/reviews`,
  },
  guides: {
    list: '/v1/guides',
    detail: (guideId: string) => `/v1/guides/${e(guideId)}`,
    reviews: (guideId: string) => `/v1/guides/${e(guideId)}/reviews`,
  },
  trust: {
    lookup: '/v1/trust/lookup',
    fraudReports: '/v1/trust/fraud-reports',
  },
  notifications: {
    list: '/v1/notifications',
    read: (notificationId: string) => `/v1/notifications/${e(notificationId)}/read`,
    readAll: '/v1/notifications/read-all',
  },
  authority: {
    overview: '/v1/authority/overview',
    sos: '/v1/authority/sos',
    sosAction: (alertId: string) => `/v1/authority/sos/${e(alertId)}/actions`,
    incidents: '/v1/authority/incidents',
    incidentAction: (incidentId: string) => `/v1/authority/incidents/${e(incidentId)}/actions`,
    verifications: '/v1/authority/verifications',
    verificationDecision: (requestId: string) => `/v1/authority/verifications/${e(requestId)}/decision`,
    analytics: '/v1/authority/analytics',
  },
  partner: {
    dashboard: '/v1/partner/dashboard',
    profile: '/v1/partner/profile',
    service: (serviceId: string) => `/v1/partner/services/${e(serviceId)}`,
    availability: '/v1/partner/availability',
    kyc: '/v1/partner/kyc',
    complaintResponse: (complaintId: string) => `/v1/partner/complaints/${e(complaintId)}/respond`,
  },
  realtime: '/v1/realtime',
} as const;
