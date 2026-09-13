import { BookingsList } from '@/components/providers/BookingsList';

export default async function TripBookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingsList tripId={id} />;
}
