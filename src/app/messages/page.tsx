import type { Metadata } from 'next';
import { MessagesScreen } from '@/components/chat/MessagesScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.messages,
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return <MessagesScreen />;
}
