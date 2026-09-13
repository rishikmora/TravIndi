import type { Metadata } from 'next';
import { SearchScreen } from '@/components/search/SearchScreen';

export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.slice(0, 100) ?? '';
  return <SearchScreen initialQuery={query} />;
}
