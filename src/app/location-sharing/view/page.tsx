import type { Metadata } from 'next';
import { ShareViewer } from '@/components/location/ShareViewer';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.sharedLocation,
  robots: { index: false, follow: false },
};

export default async function ShareViewPage({ searchParams }: { searchParams: Promise<{ share?: string | string[] }> }) {
  const { share } = await searchParams;
  const shareId = Array.isArray(share) ? share[0] : share;
  return <ShareViewer shareId={shareId && /^[\w-]{1,80}$/.test(shareId) ? shareId : null} />;
}
