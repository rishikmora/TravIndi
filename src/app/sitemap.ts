import type { MetadataRoute } from 'next';
import { destinations } from '@/data/destinations';
import { env } from '@/lib/config/env';

/** Public, indexable pages only. Private routes are excluded here and disallowed in robots.txt. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.siteUrl;
  const pages = ['', '/destinations', '/guides', '/businesses', '/safety', '/verify', '/map', '/accessibility', '/trips/new'];
  return [
    ...pages.map((path) => ({ url: `${base}${path}`, changeFrequency: 'weekly' as const, priority: path === '' ? 1 : 0.7 })),
    ...destinations.map((destination) => ({ url: `${base}/destinations/${destination.slug}`, changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
