'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PageHeader, PageShell, Section } from '@/components/app/PageShell';
import { BOOKING_STATUS, quantityLabel } from '@/components/providers/bookingVocabulary';
import { EVIDENCE_LABEL, EVIDENCE_STATUS } from '@/components/providers/trust';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Select, Switch, TextArea, TextInput } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Dialog';
import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States';
import { StatusPill, type Tone } from '@/components/ui/StatusPill';
import { isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/provider';
import { formatDate } from '@/lib/format/dates';
import { describeCost } from '@/lib/format/money';
import { usePartnerDashboard, useRespondToComplaint, useSetAvailability, useSubmitKyc, useUpdatePartnerProfile, useUpdatePartnerService } from '@/lib/query/hooks/partner';
import { toast } from '@/lib/ui/toast';
import type { Complaint, PartnerProfile } from '@/types/domain';

const KYC: Record<PartnerProfile['kycStatus'], { label: string; tone: Tone; description: string }> = {
  not_started: { label: 'Not started', tone: 'neutral', description: 'Submit documents to be verified and accept bookings.' },
  submitted: { label: 'Submitted', tone: 'info', description: 'We’ve received your documents.' },
  in_review: { label: 'In review', tone: 'info', description: 'A reviewer is checking your documents.' },
  approved: { label: 'Approved', tone: 'success', description: 'Your verification evidence is shown on your profile.' },
  rejected: { label: 'Rejected', tone: 'danger', description: 'Your application wasn’t approved.' },
  needs_info: { label: 'Needs information', tone: 'warning', description: 'Reviewers need more from you.' },
};

const DOCUMENTS = [
  { value: 'identity', label: 'Identity document' },
  { value: 'business_registration', label: 'Business registration' },
  { value: 'guide_licence', label: 'Guide licence' },
  { value: 'address_proof', label: 'Address proof' },
];

const localDate = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function PartnerDashboardView() {
  const dashboard = usePartnerDashboard();
  const updateProfile = useUpdatePartnerProfile();
  const updateService = useUpdatePartnerService();
  const setAvailability = useSetAvailability();
  const submitKyc = useSubmitKyc();
  const respond = useRespondToComplaint();
  const [description, setDescription] = useState('');
  const [languages, setLanguages] = useState('');
  const [documents, setDocuments] = useState<string[]>([]);
  const [slot, setSlot] = useState({ serviceId: '', date: localDate(1), timeSlot: '08:00', capacity: 6, status: 'open' as 'open' | 'closed' });
  const [responding, setResponding] = useState<Complaint | null>(null);
  const [response, setResponse] = useState('');
  const [loadedDashboard, setLoadedDashboard] = useState<typeof dashboard.data>(undefined);

  // Refresh the editable fields whenever the dashboard reloads.
  if (dashboard.data && dashboard.data !== loadedDashboard) {
    const data = dashboard.data;
    setLoadedDashboard(data);
    setDescription(data.profile.description);
    setLanguages(data.profile.languages.join(', '));
    setSlot((s) => ({ ...s, serviceId: s.serviceId || data.profile.services[0]?.serviceId || '' }));
  }

  if (dashboard.isPending) return <LoadingBlock label="Loading partner dashboard" className="grid gap-4"><Skeleton className="h-32 w-full rounded-[1.25rem]" /><Skeleton className="h-64 w-full rounded-[1.25rem]" /></LoadingBlock>;
  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;

  const { profile, upcomingBookings, recentReviews, openComplaints, availability } = dashboard.data;
  const kyc = KYC[profile.kycStatus];
  const serviceName = (id: string) => profile.services.find((s) => s.serviceId === id)?.name ?? id;

  return (
    <div className="grid gap-10">
      <section className="surface-card grid gap-4 p-5 md:p-6" aria-labelledby="verification-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="verification-title" className="text-[1.25rem] font-semibold">
            Verification
          </h2>
          <StatusPill tone={kyc.tone}>{kyc.label}</StatusPill>
        </div>
        <p className="text-[var(--text-muted)]">{profile.kycNote ?? kyc.description}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {profile.verification.map((evidence) => (
            <li key={evidence.kind} className="flex items-center justify-between gap-2 rounded-xl p-3 ring-1 ring-inset ring-[var(--hairline)]">
              <span>{EVIDENCE_LABEL[evidence.kind]}</span>
              <StatusPill tone={EVIDENCE_STATUS[evidence.status].tone}>{EVIDENCE_STATUS[evidence.status].label}</StatusPill>
            </li>
          ))}
        </ul>
        {profile.kycStatus !== 'approved' && (
          <div className="grid gap-3 border-t border-[var(--hairline)] pt-4">
            <p className="font-medium">Documents you’ve uploaded separately</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DOCUMENTS.map((doc) => (
                <Checkbox key={doc.value} label={doc.label} checked={documents.includes(doc.value)} onChange={(e) => setDocuments((d) => (e.target.checked ? [...d, doc.value] : d.filter((x) => x !== doc.value)))} />
              ))}
            </div>
            <Button variant="navy" className="justify-self-start" disabled={documents.length === 0} loading={submitKyc.isPending} onClick={() => submitKyc.mutate(documents, { onSuccess: () => { setDocuments([]); toast.success('Submitted for review'); } })}>
              Submit for review
            </Button>
            {submitKyc.error ? <ErrorState error={submitKyc.error} compact /> : null}
          </div>
        )}
      </section>

      <Section title="Your listing" level={2}>
        <div className="surface-card grid gap-4 p-5">
          <Field label="Description" hint="At least 20 characters." error={isApiError(updateProfile.error) ? updateProfile.error.fieldErrors.description : undefined}>
            {(control) => <TextArea {...control} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <Field label="Languages" hint="Separate with commas.">
            {(control) => <TextInput {...control} value={languages} onChange={(e) => setLanguages(e.target.value)} />}
          </Field>
          <Button
            variant="navy"
            className="justify-self-start"
            loading={updateProfile.isPending}
            onClick={() => updateProfile.mutate({ description: description.trim(), languages: languages.split(',').map((l) => l.trim()).filter(Boolean) }, { onSuccess: () => toast.success('Listing updated') })}
          >
            Save listing
          </Button>
        </div>
      </Section>

      <Section title="Services" level={2} description="Bookings can be turned on once you’re verified and a service has a price.">
        <ul className="grid gap-3">
          {profile.services.map((service) => {
            const price = describeCost(service.price);
            return (
              <li key={service.serviceId} className="surface-card grid gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid">
                    <span className="font-semibold">{service.name}</span>
                    <span className="text-[0.9375rem] text-[var(--text-muted)]">{service.description}</span>
                  </div>
                  <span className="font-semibold">{price.label}</span>
                </div>
                <Switch
                  label="Accept bookings through TravIndi"
                  checked={service.bookable}
                  disabled={updateService.isPending}
                  onChange={(e) => updateService.mutate({ serviceId: service.serviceId, patch: { bookable: e.target.checked } }, { onError: (error) => toast.error('Couldn’t change bookings', isApiError(error) ? error.message : undefined) })}
                />
              </li>
            );
          })}
          {profile.services.length === 0 && <li className="text-[var(--text-muted)]">No services listed.</li>}
        </ul>
      </Section>

      <Section title="Availability" level={2} description="Travellers can only book open times with space left.">
        <form
          className="surface-card grid gap-3 p-5 sm:grid-cols-[1.4fr_1fr_0.8fr_0.7fr_0.8fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setAvailability.mutate(slot, { onSuccess: () => toast.success('Availability saved') });
          }}
        >
          <Field label="Service">
            {(control) => (
              <Select {...control} value={slot.serviceId} onChange={(e) => setSlot({ ...slot, serviceId: e.target.value })}>
                {profile.services.map((s) => (
                  <option key={s.serviceId} value={s.serviceId}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date">{(control) => <TextInput {...control} type="date" min={localDate(0)} value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} />}</Field>
          <Field label="Time">{(control) => <TextInput {...control} type="time" value={slot.timeSlot} onChange={(e) => setSlot({ ...slot, timeSlot: e.target.value })} />}</Field>
          <Field label="Places">{(control) => <TextInput {...control} type="number" min={1} max={100} value={slot.capacity} onChange={(e) => setSlot({ ...slot, capacity: Number(e.target.value) })} />}</Field>
          <Field label="Status">
            {(control) => (
              <Select {...control} value={slot.status} onChange={(e) => setSlot({ ...slot, status: e.target.value as 'open' | 'closed' })}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </Select>
            )}
          </Field>
          <Button type="submit" variant="navy" loading={setAvailability.isPending} disabled={!slot.serviceId}>
            Save
          </Button>
        </form>
        {setAvailability.error ? isApiError(setAvailability.error) && setAvailability.error.kind === 'validation' ? <InlineNotice tone="warning">{Object.values(setAvailability.error.fieldErrors)[0] ?? setAvailability.error.message}</InlineNotice> : <ErrorState error={setAvailability.error} compact /> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-[0.9375rem]">
            <thead className="text-[var(--text-muted)]">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                <th scope="col" className="py-2 pr-3 font-medium">Time</th>
                <th scope="col" className="py-2 pr-3 font-medium">Service</th>
                <th scope="col" className="py-2 pr-3 font-medium">Booked</th>
                <th scope="col" className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {availability.slice(0, 21).map((s) => (
                <tr key={s.slotId}>
                  <td className="py-2 pr-3">{formatDate(s.date, false)}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.timeSlot}</td>
                  <td className="py-2 pr-3">{serviceName(s.serviceId)}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.booked} / {s.capacity}</td>
                  <td className="py-2"><StatusPill tone={s.status === 'open' ? 'success' : 'neutral'}>{s.status}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Upcoming bookings" level={2}>
          {upcomingBookings.length === 0 ? (
            <p className="text-[var(--text-muted)]">No upcoming bookings.</p>
          ) : (
            <ul className="surface-card divide-y divide-[var(--hairline)]">
              {upcomingBookings.map((booking) => (
                <li key={booking.bookingId} className="grid gap-1 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{booking.serviceName}</span>
                    <StatusPill tone={BOOKING_STATUS[booking.status].tone}>{BOOKING_STATUS[booking.status].label}</StatusPill>
                  </div>
                  <span className="text-[0.875rem] text-[var(--text-muted)]">
                    {formatDate(booking.date)}
                    {booking.timeSlot ? ` · ${booking.timeSlot}` : ''} · {quantityLabel(booking.unit, booking.quantity, booking.nights)}
                    {booking.confirmationCode ? ` · ${booking.confirmationCode}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Complaints" level={2} description="Respond calmly and specifically. Your response is shared with the traveller.">
          {openComplaints.length === 0 ? (
            <p className="text-[var(--text-muted)]">No open complaints.</p>
          ) : (
            <ul className="grid gap-3">
              {openComplaints.map((complaint) => (
                <li key={complaint.complaintId} className="surface-card grid gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={complaint.status === 'open' ? 'warning' : 'info'}>{complaint.status}</StatusPill>
                    <span className="font-medium">{complaint.category}</span>
                  </div>
                  <p>{complaint.summary}</p>
                  {complaint.status === 'open' && (
                    <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => { setResponding(complaint); setResponse(''); }}>
                      Respond
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Recent reviews" level={2}>
        {recentReviews.length === 0 ? (
          <EmptyState title="No reviews yet" description="Reviews from verified bookings appear here." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {recentReviews.map((review) => (
              <li key={review.reviewId} className="surface-card grid gap-1 p-4">
                <span className="font-medium">
                  {review.authorName} · {review.rating}/5
                </span>
                <p className="text-[var(--text-muted)]">{review.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Dialog
        open={Boolean(responding)}
        onClose={() => setResponding(null)}
        title="Respond to complaint"
        description={responding?.summary}
        dismissible={!respond.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResponding(null)} disabled={respond.isPending}>
              Cancel
            </Button>
            <Button variant="navy" loading={respond.isPending} disabled={response.trim().length < 10} onClick={() => responding && respond.mutate({ complaintId: responding.complaintId, response: response.trim() }, { onSuccess: () => { setResponding(null); toast.success('Response sent'); } })}>
              Send response
            </Button>
          </>
        }
      >
        <div className="grid gap-3 pb-2">
          <Field label="Your response" hint="At least 10 characters.">
            {(control) => <TextArea {...control} maxLength={2000} value={response} onChange={(e) => setResponse(e.target.value)} />}
          </Field>
          {respond.error ? <ErrorState error={respond.error} compact /> : null}
        </div>
      </Dialog>
    </div>
  );
}

function PartnerGate() {
  const { hasRole } = useAuth();
  if (!hasRole('guide') && !hasRole('business')) {
    return <EmptyState as="h2" title="This area is for TravIndi partners" description="Guides and businesses manage their listings, availability and bookings here." />;
  }
  return <PartnerDashboardView />;
}

export function PartnerScreen() {
  return (
    <PageShell width="wide">
      <PageHeader eyebrow="Partners" title="Partner portal" description="Your listing, verification, availability and bookings." />
      <RequireAuth title="Sign in to the partner portal">
        <PartnerGate />
      </RequireAuth>
    </PageShell>
  );
}
