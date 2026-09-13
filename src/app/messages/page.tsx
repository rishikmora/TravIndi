import type { Metadata } from 'next';
import { MessagesScreen } from '@/components/chat/MessagesScreen';

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return <MessagesScreen />;
}
