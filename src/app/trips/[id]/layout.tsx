import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TripFrame } from '@/components/trips/detail/TripFrame';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.trip,
  robots: { index: false, follow: false },
};

export default async function TripLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripFrame tripId={id}>{children}</TripFrame>;
}
