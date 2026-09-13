import { endpoints } from '@/lib/api/endpoints';
import type { AvailabilitySlotDto, ComplaintDto, PartnerDashboardDto, PartnerProfileDto, ServiceDto } from '@/types/api';
import type { AvailabilitySlot, Complaint, PartnerDashboard, PartnerProfile, Service } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface PartnerRepository {
  dashboard(options?: RequestOptions): Promise<PartnerDashboard>;
  updateProfile(input: { description?: string; languages?: string[] }): Promise<PartnerProfile>;
  updateService(serviceId: string, input: { name?: string; description?: string; bookable?: boolean }): Promise<Service>;
  setAvailability(input: { serviceId: string; date: string; timeSlot: string; capacity: number; status: 'open' | 'closed' }): Promise<AvailabilitySlot>;
  submitKyc(input: { documentKinds: string[] }): Promise<PartnerProfile>;
  respondToComplaint(complaintId: string, response: string): Promise<Complaint>;
}

export function createPartnerRepository(client: RepositoryClient): PartnerRepository {
  return {
    dashboard: (options) => client.get<PartnerDashboardDto>(endpoints.partner.dashboard, undefined, options),
    updateProfile: (input) => client.patch<PartnerProfileDto>(endpoints.partner.profile, input),
    updateService: (serviceId, input) => client.patch<ServiceDto>(endpoints.partner.service(serviceId), input),
    setAvailability: (input) => client.post<AvailabilitySlotDto>(endpoints.partner.availability, input),
    submitKyc: (input) => client.post<PartnerProfileDto>(endpoints.partner.kyc, input),
    respondToComplaint: (complaintId, response) =>
      client.post<ComplaintDto>(endpoints.partner.complaintResponse(complaintId), { response }),
  };
}
