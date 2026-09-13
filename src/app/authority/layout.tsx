import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthorityFrame } from '@/components/authority/AuthorityFrame';

export const metadata: Metadata = {
  title: { default: 'Authority', template: '%s · Authority · TravIndi' },
  robots: { index: false, follow: false },
};

export default function AuthorityLayout({ children }: { children: ReactNode }) {
  return <AuthorityFrame>{children}</AuthorityFrame>;
}
