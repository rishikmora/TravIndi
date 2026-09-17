import en from '@/i18n/locales/en';
import { env } from '@/lib/config/env';

export type PrimaryNavId = 'home' | 'discover' | 'trips' | 'map' | 'messages' | 'safety' | 'profile';

export type FooterColumnId = keyof typeof en.footer.columns;
export type FooterLinkId = keyof typeof en.footer.links;

/**
 * Site structure. Visible labels live in the translation dictionaries
 * (`nav.items.*`, `footer.*`); the English copies here serve server-rendered
 * metadata only.
 */
export const site = {
  name: en.common.appName,
  tagline: en.common.meta.tagline,
  description: en.common.meta.description,
  url: env.siteUrl,
  locale: 'en_IN',
  themeColor: '#14213d',
  nav: [
    { id: 'home', href: '/' },
    { id: 'discover', href: '/destinations' },
    { id: 'trips', href: '/trips' },
    { id: 'map', href: '/map' },
    { id: 'messages', href: '/messages' },
    { id: 'safety', href: '/safety' },
    { id: 'profile', href: '/profile' },
  ] satisfies Array<{ id: PrimaryNavId; href: string }>,
  footer: {
    columns: [
      {
        id: 'explore',
        links: [
          { id: 'destinations', href: '/destinations' },
          { id: 'map', href: '/map' },
          { id: 'guides', href: '/guides' },
          { id: 'businesses', href: '/businesses' },
        ],
      },
      {
        id: 'travel',
        links: [
          { id: 'plan', href: '/trips/new' },
          { id: 'trips', href: '/trips' },
          { id: 'bookings', href: '/bookings' },
          { id: 'messages', href: '/messages' },
        ],
      },
      {
        id: 'safety',
        links: [
          { id: 'safetyCentre', href: '/safety' },
          { id: 'sos', href: '/sos' },
          { id: 'verify', href: '/verify' },
          { id: 'fraud', href: '/trust/fraud' },
        ],
      },
      {
        id: 'you',
        links: [
          { id: 'accessibility', href: '/accessibility' },
          { id: 'consents', href: '/consents' },
          { id: 'settings', href: '/settings' },
          { id: 'partners', href: '/partner' },
        ],
      },
    ] satisfies Array<{ id: FooterColumnId; links: Array<{ id: FooterLinkId; href: string }> }>,
  },
} as const;

export type SiteConfig = typeof site;
