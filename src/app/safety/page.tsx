import type { Metadata } from 'next';
import { SafetyScreen } from '@/components/safety/SafetyScreen';

export const metadata: Metadata = {
  title: 'Safety centre',
  description: 'Help nearby, advisories, emergency numbers and personal safety tools for travelling in India.',
};

export default function SafetyPage() {
  return <SafetyScreen />;
}
