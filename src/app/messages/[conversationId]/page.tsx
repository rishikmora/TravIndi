import type { Metadata } from 'next';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { ConversationScreen } from '@/components/chat/MessagesScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.conversation,
  robots: { index: false, follow: false },
};

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return (
    <ConversationScreen conversationId={conversationId}>
      <ChatRoom conversationId={conversationId} backHref="/messages" className="h-[min(46rem,calc(100dvh-9rem))]" />
    </ConversationScreen>
  );
}
