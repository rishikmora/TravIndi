import type { CapabilitiesDto } from '@/types/api';

/**
 * Capability flags. Backend-dependent capabilities are enabled only when the
 * backend reports them (`GET /v1/capabilities`) and the environment has not
 * switched them off. The UI never assumes a capability exists.
 */

export type BackendCapability = keyof CapabilitiesDto;

export type EnvFlagValue = boolean | undefined;

/** `undefined` defers to the backend; `false` force-disables. */
const envFlags: Record<BackendCapability, EnvFlagValue> = {
  live_crowd: parseFlag(process.env.NEXT_PUBLIC_ENABLE_LIVE_CROWD),
  weather: parseFlag(process.env.NEXT_PUBLIC_ENABLE_WEATHER),
  transport: parseFlag(process.env.NEXT_PUBLIC_ENABLE_TRANSPORT),
  push: parseFlag(process.env.NEXT_PUBLIC_ENABLE_PUSH),
  payment: parseFlag(process.env.NEXT_PUBLIC_ENABLE_PAYMENT),
  auto_adaptation: parseFlag(process.env.NEXT_PUBLIC_ENABLE_AUTO_ADAPTATION),
  turn_by_turn: parseFlag(process.env.NEXT_PUBLIC_ENABLE_TURN_BY_TURN),
  sms: parseFlag(process.env.NEXT_PUBLIC_ENABLE_SMS),
  offline_message_queue: parseFlag(process.env.NEXT_PUBLIC_ENABLE_OFFLINE_MESSAGE_QUEUE),
  authority_integration: parseFlag(process.env.NEXT_PUBLIC_ENABLE_AUTHORITY_INTEGRATION),
  community: parseFlag(process.env.NEXT_PUBLIC_ENABLE_COMMUNITY),
  gamification: parseFlag(process.env.NEXT_PUBLIC_ENABLE_GAMIFICATION),
  bookings: parseFlag(process.env.NEXT_PUBLIC_ENABLE_BOOKINGS),
  location_sharing: parseFlag(process.env.NEXT_PUBLIC_ENABLE_LOCATION_SHARING),
};

function parseFlag(value: string | undefined): EnvFlagValue {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/** Conservative defaults used before the backend has answered (or if it cannot). */
export const UNKNOWN_CAPABILITIES: CapabilitiesDto = {
  live_crowd: false,
  weather: false,
  transport: false,
  push: false,
  payment: false,
  auto_adaptation: false,
  turn_by_turn: false,
  sms: false,
  offline_message_queue: false,
  authority_integration: false,
  community: false,
  gamification: false,
  bookings: false,
  location_sharing: false,
};

export function resolveCapabilities(fromBackend: CapabilitiesDto | null | undefined): CapabilitiesDto {
  const base = fromBackend ?? UNKNOWN_CAPABILITIES;
  const resolved = { ...base };
  for (const key of Object.keys(envFlags) as BackendCapability[]) {
    if (envFlags[key] === false) resolved[key] = false;
  }
  return resolved;
}
