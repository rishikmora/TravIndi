import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DestinationDetail } from '@/components/destinations/DestinationDetail';
import { getPublicDestination } from '@/lib/api/server';
import { env } from '@/lib/config/env';
import { isTrustedImageUrl } from '@/lib/media/trusted';

export const revalidate = 300;

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const destination = SLUG.test(id) ? await getPublicDestination(id) : null;
  if (!destination) return { title: 'Destination not found', robots: { index: false } };
  const description = (destination.description[0] ?? destination.tagline).slice(0, 155);
  const title = `${destination.name}, ${destination.state}`;
  const image = destination.heroImage && isTrustedImageUrl(destination.heroImage.url) ? destination.heroImage : null;
  return {
    title,
    description,
    alternates: { canonical: `/destinations/${destination.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      images: image ? [{ url: image.url, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.alt }] : undefined,
    },
  };
}

export default async function DestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SLUG.test(id)) notFound();
  const destination = await getPublicDestination(id);
  if (!destination) notFound();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: destination.name,
    description: destination.tagline,
    url: `${env.siteUrl}/destinations/${destination.slug}`,
    geo: { '@type': 'GeoCoordinates', latitude: destination.coordinates.lat, longitude: destination.coordinates.lng },
    containedInPlace: { '@type': 'State', name: destination.state },
    touristType: destination.tags,
    includesAttraction: destination.attractions.map((attraction) => ({ '@type': 'TouristAttraction', name: attraction.name })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <DestinationDetail destination={destination} />
    </>
  );
}
