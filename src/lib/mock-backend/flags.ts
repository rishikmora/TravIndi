/** Development scenario switches. Toggled from the dev tools panel; never present in API mode. */
export const mockFlags = {
  /** Operations desk acknowledges a new SOS after a short delay. */
  autoAcknowledgeSos: true,
  /** Trip members reply to messages you send. */
  chatAutoReply: true,
  /** A crowd-change proposal arrives once per browser session on the active trip. */
  autoplayAdaptation: true,
  /** The next itinerary generation job fails. */
  failNextGeneration: false,
  /** The next adaptation acceptance fails server-side. */
  failNextAccept: false,
  /** Added to every response, in milliseconds. */
  extraLatencyMs: 0,
};

export type MockFlags = typeof mockFlags;
