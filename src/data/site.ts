import { env } from '@/lib/config/env';

export type PrimaryNavId = 'home' | 'discover' | 'trips' | 'map' | 'messages' | 'safety' | 'profile';

export const site = {
  name: 'TravIndi',
  tagline: 'Travel India, your way — safely',
  description:
    'Plan journeys across India that adapt when plans change, with verified local guides, honest information and safety tools built in.',
  url: env.siteUrl,
  locale: 'en_IN',
  themeColor: '#14213d',
  nav: [
    { id: 'home', label: 'Home', href: '/' },
    { id: 'discover', label: 'Discover', href: '/destinations' },
    { id: 'trips', label: 'Trips', href: '/trips' },
    { id: 'map', label: 'Map', href: '/map' },
    { id: 'messages', label: 'Messages', href: '/messages' },
    { id: 'safety', label: 'Safety', href: '/safety' },
    { id: 'profile', label: 'Profile', href: '/profile' },
  ] satisfies Array<{ id: PrimaryNavId; label: string; href: string }>,
  footer: {
    columns: [
      {
        heading: 'Explore',
        links: [
          { label: 'Destinations', href: '/destinations' },
          { label: 'Map of India', href: '/map' },
          { label: 'Local guides', href: '/guides' },
          { label: 'Local businesses', href: '/businesses' },
        ],
      },
      {
        heading: 'Travel',
        links: [
          { label: 'Plan a journey', href: '/trips/new' },
          { label: 'My trips', href: '/trips' },
          { label: 'Bookings', href: '/bookings' },
          { label: 'Messages', href: '/messages' },
        ],
      },
      {
        heading: 'Safety & trust',
        links: [
          { label: 'Safety centre', href: '/safety' },
          { label: 'Emergency SOS', href: '/sos' },
          { label: 'Verify a provider', href: '/verify' },
          { label: 'Report fraud', href: '/trust/fraud' },
        ],
      },
      {
        heading: 'You',
        links: [
          { label: 'Accessibility', href: '/accessibility' },
          { label: 'Privacy & consents', href: '/consents' },
          { label: 'Settings', href: '/settings' },
          { label: 'For partners', href: '/partner' },
        ],
      },
    ],
    disclaimer: 'Travel information is indicative and labelled with its source. In an emergency, call 112.',
    legal: 'Map outline adapted from svg-maps by Victor Cazanave (CC BY 4.0). Journey scenes are rendered live in your browser.',
  },
} as const;

export type SiteConfig = typeof site;
