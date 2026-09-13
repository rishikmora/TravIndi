'use client';

import { LoadingBlock, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/States';
import { useTrip } from '@/lib/query/hooks/trips';
import { ChatRoom } from './ChatRoom';

export function TripChat({ tripId }: { tripId: string }) {
  const trip = useTrip(tripId);
  if (trip.isPending) {
    return (
      <LoadingBlock label="Loading trip chat">
        <Skeleton className="h-[32rem] w-full rounded-[1.25rem]" />
      </LoadingBlock>
    );
  }
  const conversationId = trip.data?.conversationId;
  if (!conversationId) return <EmptyState title="This trip doesn’t have a chat" description="Trip chats are created when a trip is saved." />;
  return <ChatRoom conversationId={conversationId} liveLocationHref={`/location-sharing?trip=${tripId}`} className="h-[min(44rem,calc(100dvh-16rem))]" />;
}
