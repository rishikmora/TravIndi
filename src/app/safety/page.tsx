import type { Metadata } from 'next';
import { SafetyScreen } from '@/components/safety/SafetyScreen';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.safety,
  description: 'Help nearby, advisories, emergency numbers and personal safety tools for travelling in India.',
};

export default function SafetyPage() {
  return <SafetyScreen />;
}
