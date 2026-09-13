import type { Metadata } from 'next';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { BookingsList } from '@/components/providers/BookingsList';

export const metadata: Metadata = {
  title: 'Bookings',
  robots: { index: false, follow: false },
};

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ booking?: string | string[] }> }) {
  const { booking } = await searchParams;
  const highlight = Array.isArray(booking) ? booking[0] : booking;
  return (
    <PageShell width="default">
      <PageHeader eyebrow="Trips" title="Bookings and tickets" description="Status is updated by the provider. TravIndi doesn’t take payments." />
      <RequireAuth>
        <BookingsList highlightId={highlight && /^[\w-]{1,80}$/.test(highlight) ? highlight : null} />
      </RequireAuth>
    </PageShell>
  );
}
