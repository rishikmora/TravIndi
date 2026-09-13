import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    // Geolocation is allowed for this site only (SOS, location sharing, "use my location").
    value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
  },
];

const immutableAssetHeaders = [
  { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
];

const nextConfig: NextConfig = {
  // Pin the workspace root; a lockfile higher up the tree would otherwise be picked.
  turbopack: { root: process.cwd() },
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [60, 75, 85],
    deviceSizes: [640, 828, 1080, 1440, 1920, 2560],
  },
  async redirects() {
    // Browsers that ignore the SVG icon link still ask for /favicon.ico.
    return [{ source: '/favicon.ico', destination: '/icon.svg', permanent: true }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      { source: '/models/:path*', headers: immutableAssetHeaders },
      { source: '/videos/:path*', headers: immutableAssetHeaders },
      { source: '/images/:path*', headers: immutableAssetHeaders },
    ];
  },
};

export default nextConfig;
