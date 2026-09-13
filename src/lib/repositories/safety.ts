import { endpoints } from '@/lib/api/endpoints';
import type { CheckInDto, IncidentDto, SafetyContextDto, SosAlertDto, TrustedContactDto } from '@/types/api';
import type {
  CheckIn,
  GeoPoint,
  Incident,
  IncidentReportInput,
  SafetyContext,
  SosAlert,
  SosInput,
  TrustedContact,
  TrustedContactInput,
} from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface SafetyRepository {
  context(input: { point?: GeoPoint | null; tripId?: string | null }, options?: RequestOptions): Promise<SafetyContext>;
  incidents(input: { tripId?: string | null; mine?: boolean }, options?: RequestOptions): Promise<Incident[]>;
  reportIncident(input: IncidentReportInput): Promise<Incident>;
  trustedContacts(options?: RequestOptions): Promise<TrustedContact[]>;
  addTrustedContact(input: TrustedContactInput): Promise<TrustedContact>;
  updateTrustedContact(contactId: string, input: Partial<TrustedContactInput>): Promise<TrustedContact>;
  removeTrustedContact(contactId: string): Promise<void>;
  checkIns(tripId?: string | null): Promise<CheckIn[]>;
  scheduleCheckIn(input: { tripId: string | null; dueAt: string; note: string | null }): Promise<CheckIn>;
  completeCheckIn(checkInId: string): Promise<CheckIn>;
}

export interface SosRepository {
  /** Idempotent on `clientAlertId`; safe to retry from the offline outbox. */
  create(input: SosInput): Promise<SosAlert>;
  active(options?: RequestOptions): Promise<SosAlert | null>;
  get(alertId: string, options?: RequestOptions): Promise<SosAlert>;
  cancel(alertId: string): Promise<SosAlert>;
}

export function createSafetyRepository(client: RepositoryClient): SafetyRepository {
  return {
    context: ({ point, tripId }, options) =>
      client.get<SafetyContextDto>(
        endpoints.safety.context,
        { lat: point?.lat, lng: point?.lng, tripId: tripId ?? undefined },
        options,
      ),
    incidents: async ({ tripId, mine }, options) =>
      (
        await client.get<{ items: IncidentDto[] }>(
          endpoints.safety.incidents,
          { tripId: tripId ?? undefined, mine: mine || undefined },
          options,
        )
      ).items,
    reportIncident: (input) =>
      client.post<IncidentDto>(endpoints.safety.reports, input, { idempotencyKey: input.clientReportId }),
    trustedContacts: async (options) =>
      (await client.get<{ items: TrustedContactDto[] }>(endpoints.safety.trustedContacts, undefined, options)).items,
    addTrustedContact: (input) => client.post<TrustedContactDto>(endpoints.safety.trustedContacts, input),
    updateTrustedContact: (contactId, input) =>
      client.patch<TrustedContactDto>(endpoints.safety.trustedContact(contactId), input),
    removeTrustedContact: (contactId) => client.delete(endpoints.safety.trustedContact(contactId)),
    checkIns: async (tripId) =>
      (await client.get<{ items: CheckInDto[] }>(endpoints.safety.checkIns, { tripId: tripId ?? undefined })).items,
    scheduleCheckIn: (input) => client.post<CheckInDto>(endpoints.safety.checkIns, input),
    completeCheckIn: (checkInId) => client.post<CheckInDto>(endpoints.safety.checkIn(checkInId), { status: 'completed' }),
  };
}

export function createSosRepository(client: RepositoryClient): SosRepository {
  return {
    create: (input) => client.post<SosAlertDto>(endpoints.sos.create, input, { idempotencyKey: input.clientAlertId }),
    active: async (options) =>
      (await client.get<{ alert: SosAlertDto | null }>(endpoints.sos.active, undefined, options)).alert,
    get: (alertId, options) => client.get<SosAlertDto>(endpoints.sos.detail(alertId), undefined, options),
    cancel: (alertId) => client.post<SosAlertDto>(endpoints.sos.cancel(alertId)),
  };
}
