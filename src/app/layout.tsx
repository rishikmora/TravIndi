import type { Metadata, Viewport } from 'next';
import {
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Sans_Kannada,
  Noto_Sans_Malayalam,
  Noto_Sans_Tamil,
  Noto_Sans_Telugu,
} from 'next/font/google';
import type { ReactNode } from 'react';
import { ConnectivityBanner } from '@/components/app/ConnectivityBanner';
import { MockModeTools } from '@/components/app/MockModeTools';
import { ServiceWorkerRegistration } from '@/components/app/ServiceWorkerRegistration';
import { Footer } from '@/components/layout/Footer';
import { Navigation } from '@/components/layout/Navigation';
import { Providers } from '@/components/layout/Providers';
import { Toaster } from '@/components/ui/Toaster';
import { site } from '@/data/site';
import { DEFAULT_LOCALE, LOCALE_INFO, LOCALE_STORAGE_KEY, LOCALES } from '@/i18n/config';
import en from '@/i18n/locales/en';
import { DocumentTitleSync } from '@/i18n/DocumentTitle';
import { LocaleBoot, T } from '@/i18n/react';
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

// Indian scripts. Declared up front, but a font file is only downloaded when
// text in that script is on screen, so English visitors never fetch them.
const devanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], variable: '--font-deva', display: 'swap', preload: false });
const telugu = Noto_Sans_Telugu({ subsets: ['telugu'], variable: '--font-telu', display: 'swap', preload: false });
const tamil = Noto_Sans_Tamil({ subsets: ['tamil'], variable: '--font-taml', display: 'swap', preload: false });
const kannada = Noto_Sans_Kannada({ subsets: ['kannada'], variable: '--font-knda', display: 'swap', preload: false });
const malayalam = Noto_Sans_Malayalam({ subsets: ['malayalam'], variable: '--font-mlym', display: 'swap', preload: false });
const bengali = Noto_Sans_Bengali({ subsets: ['bengali'], variable: '--font-beng', display: 'swap', preload: false });

const fontVariables = [geist, geistMono, instrumentSerif, devanagari, telugu, tamil, kannada, malayalam, bengali]
  .map((font) => font.variable)
  .join(' ');

/**
 * Runs before first paint. A traveller who chose another language sees the
 * page briefly held back while that language is applied (at most 1.5 s),
 * instead of English flashing first.
 */
const LOCALE_BOOT_SCRIPT = `(function(){try{var m=${JSON.stringify(
  Object.fromEntries(LOCALES.filter((code) => code !== DEFAULT_LOCALE).map((code) => [code, LOCALE_INFO[code].htmlLang])),
)};var l=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)});if(!l||!m[l])return;var d=document.documentElement;d.lang=m[l];d.setAttribute('data-locale',l);d.setAttribute('data-locale-pending','');setTimeout(function(){d.removeAttribute('data-locale-pending')},1500)}catch(e){}})();`;

const title = en.common.meta.title;

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
    <html lang={LOCALE_INFO[DEFAULT_LOCALE].htmlLang} className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOT_SCRIPT }} />
      </head>
      <body>
        <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_STYLES }} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-paper focus:px-5 focus:py-2.5 focus:text-ink"
        >
          <T k="common.a11y.skipToContent" />
        </a>
        <LocaleBoot />
        <DocumentTitleSync />
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
