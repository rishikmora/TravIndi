import { TripChat } from '@/components/chat/TripChat';

export default async function TripChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripChat tripId={id} />;
}
