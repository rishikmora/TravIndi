import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import en from '@/i18n/locales/en';
import { AuthorityFrame } from '@/components/authority/AuthorityFrame';

export const metadata: Metadata = {
  title: { default: en.meta.titles.authority, template: `%s · ${en.meta.titles.authority} · TravIndi` },
  robots: { index: false, follow: false },
};

export default function AuthorityLayout({ children }: { children: ReactNode }) {
  return <AuthorityFrame>{children}</AuthorityFrame>;
}
