/**
 * Every React Query key in one place, so realtime events and mutations can
 * invalidate precisely. Keys are hierarchical: invalidating a prefix
 * (e.g. `queryKeys.trips.detail(id)`) also invalidates its children.
 */
export const queryKeys = {
  capabilities: ['platform', 'capabilities'] as const,
  metrics: ['platform', 'metrics'] as const,
  session: ['auth', 'session'] as const,

  me: {
    all: ['me'] as const,
    profile: ['me', 'profile'] as const,
    home: ['me', 'home'] as const,
    consents: ['me', 'consents'] as const,
    dataRequests: ['me', 'data-requests'] as const,
  },

  search: (q: string, types: string) => ['search', q, types] as const,

  destinations: {
    list: (params: Record<string, unknown>) => ['destinations', 'list', params] as const,
    detail: (slug: string) => ['destinations', 'detail', slug] as const,
    channels: (destinationId: string) => ['destinations', 'channels', destinationId] as const,
    posts: (channelId: string) => ['community', 'posts', channelId] as const,
  },

  trips: {
    all: ['trips'] as const,
    list: ['trips', 'list'] as const,
    detail: (tripId: string) => ['trips', 'detail', tripId] as const,
    itinerary: (tripId: string) => ['trips', 'detail', tripId, 'itinerary'] as const,
    versions: (tripId: string) => ['trips', 'detail', tripId, 'versions'] as const,
    version: (tripId: string, version: number) => ['trips', 'detail', tripId, 'versions', version] as const,
    adaptations: (tripId: string) => ['trips', 'detail', tripId, 'adaptations'] as const,
    bookingRecommendations: (tripId: string) => ['trips', 'detail', tripId, 'booking-recommendations'] as const,
    job: (jobId: string) => ['itinerary-jobs', jobId] as const,
  },

  adaptation: (proposalId: string) => ['adaptations', proposalId] as const,

  map: {
    layers: (bbox: string, layers: string, tripId: string | null) => ['map', 'layers', bbox, layers, tripId] as const,
    routes: (key: string) => ['map', 'routes', key] as const,
  },

  safety: {
    all: ['safety'] as const,
    context: (lat: number | null, lng: number | null, tripId: string | null) => ['safety', 'context', lat, lng, tripId] as const,
    incidents: (tripId: string | null, mine: boolean) => ['safety', 'incidents', tripId, mine] as const,
    trustedContacts: ['safety', 'trusted-contacts'] as const,
    checkIns: (tripId: string | null) => ['safety', 'check-ins', tripId] as const,
  },

  sos: {
    all: ['sos'] as const,
    active: ['sos', 'active'] as const,
    detail: (alertId: string) => ['sos', 'detail', alertId] as const,
  },

  location: {
    all: ['location'] as const,
    mine: ['location', 'mine'] as const,
    visible: ['location', 'visible'] as const,
    share: (shareId: string) => ['location', 'share', shareId] as const,
    history: ['location', 'history'] as const,
  },

  chat: {
    all: ['chat'] as const,
    conversations: ['chat', 'conversations'] as const,
    conversation: (conversationId: string) => ['chat', 'conversation', conversationId] as const,
    messages: (conversationId: string) => ['chat', 'messages', conversationId] as const,
  },

  bookings: {
    all: ['bookings'] as const,
    list: (tripId: string | null) => ['bookings', 'list', tripId] as const,
    detail: (bookingId: string) => ['bookings', 'detail', bookingId] as const,
  },

  businesses: {
    list: (params: Record<string, unknown>) => ['businesses', 'list', params] as const,
    detail: (id: string) => ['businesses', 'detail', id] as const,
    reviews: (id: string) => ['businesses', 'reviews', id] as const,
  },

  guides: {
    list: (params: Record<string, unknown>) => ['guides', 'list', params] as const,
    detail: (id: string) => ['guides', 'detail', id] as const,
    reviews: (id: string) => ['guides', 'reviews', id] as const,
  },

  trust: {
    lookup: (q: string) => ['trust', 'lookup', q] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (unreadOnly: boolean) => ['notifications', unreadOnly ? 'unread' : 'all'] as const,
  },

  authority: {
    all: ['authority'] as const,
    overview: ['authority', 'overview'] as const,
    sos: (status: string) => ['authority', 'sos', status] as const,
    incidents: (filters: string) => ['authority', 'incidents', filters] as const,
    verifications: (status: string) => ['authority', 'verifications', status] as const,
    analytics: (range: string) => ['authority', 'analytics', range] as const,
  },

  partner: {
    dashboard: ['partner', 'dashboard'] as const,
  },
} as const;
