import type { MetadataRoute } from 'next';
import { env } from '@/lib/config/env';

const PRIVATE = [
  '/trips/',
  '/messages',
  '/sos',
  '/location-sharing',
  '/trusted-contacts',
  '/report',
  '/notifications',
  '/bookings',
  '/profile',
  '/settings',
  '/consents',
  '/authority',
  '/partner',
  '/login',
  '/register',
  '/search',
  '/offline',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/trips/new'], disallow: PRIVATE }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
