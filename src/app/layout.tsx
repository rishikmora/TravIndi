import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import type { ReactNode } from 'react';
import { ConnectivityBanner } from '@/components/app/ConnectivityBanner';
import { MockModeTools } from '@/components/app/MockModeTools';
import { ServiceWorkerRegistration } from '@/components/app/ServiceWorkerRegistration';
import { Footer } from '@/components/layout/Footer';
import { Navigation } from '@/components/layout/Navigation';
import { Providers } from '@/components/layout/Providers';
import { Toaster } from '@/components/ui/Toaster';
import { site } from '@/data/site';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

const title = `${site.name} — Smart, safe travel across India`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: title, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  keywords: [
    'India travel planner',
    'places to visit in India',
    'adaptive itinerary',
    'tourist safety India',
    'verified local guides',
    'Hyderabad',
    'Jaipur',
    'Kerala backwaters',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: site.name,
    locale: site.locale,
    url: '/',
    title,
    description: site.description,
  },
  twitter: { card: 'summary_large_image', title, description: site.description },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  category: 'travel',
};

export const viewport: Viewport = {
  themeColor: site.themeColor,
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const NOSCRIPT_STYLES =
  '<style>[data-reveal],.split-char{opacity:1!important;transform:none!important;filter:none!important;visibility:visible!important}</style>';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body>
        <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_STYLES }} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-paper focus:px-5 focus:py-2.5 focus:text-ink"
        >
          Skip to content
        </a>
        <Providers>
          <Navigation />
          <ConnectivityBanner />
          <main id="main" className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
            {children}
          </main>
          <Footer />
          <Toaster />
          <MockModeTools />
          <ServiceWorkerRegistration />
        </Providers>
      </body>
    </html>
  );
}
