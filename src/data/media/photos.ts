import manifest from '@/data/generated/destination-photos.json';

export interface Photo {
  /** 1920px rendition. */
  src: string;
  /** 960px rendition for cards. */
  src_small: string;
  /** 330px rendition for thumbnails. */
  src_thumb?: string;
  width: number;
  height: number;
  alt: string;
  author: string;
  licence: string;
  licence_url: string | null;
  /** The file page on Wikimedia Commons. */
  source_url: string;
  title: string;
}

export interface DestinationPhotos {
  hero: Photo;
  gallery: Photo[];
  /** Keyed by attraction slug. */
  attractions: Record<string, Photo>;
}

/**
 * Destination photography: Featured and Quality pictures from Wikimedia
 * Commons, chosen per destination and credited to their photographers
 * (regenerate with `scripts/photos`). Any entry can be replaced by slug
 * without touching components.
 */
const photos = manifest as unknown as Record<string, DestinationPhotos>;

export function getDestinationPhotos(slug: string): DestinationPhotos | undefined {
  return photos[slug];
}
