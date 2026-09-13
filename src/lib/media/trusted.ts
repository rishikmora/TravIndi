import { env } from '@/lib/config/env';

/** Editorial destination photography comes from Wikimedia Commons and is always shown with its credit. */
const PHOTO_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org']);

/**
 * Only images from this app, the configured asset CDN or the photo library
 * hosts are rendered. Anything else (e.g. a URL in user-generated content)
 * falls back to a placeholder.
 */
export function isTrustedImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:') return false;
    if (PHOTO_HOSTS.has(target.host)) return true;
    return Boolean(env.assetCdn) && target.host === new URL(env.assetCdn!).host;
  } catch {
    return false;
  }
}

/** Remote photos arrive already resized by their host, so they skip the image optimiser. */
export const isRemoteImage = (url: string) => !url.startsWith('/');
