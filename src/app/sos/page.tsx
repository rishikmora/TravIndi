import type { Metadata } from 'next';
import { SosScreen } from '@/components/safety/SosScreen';

export const metadata: Metadata = {
  title: 'Emergency SOS',
  robots: { index: false, follow: false },
};

export default function SosPage() {
  return <SosScreen />;
}
