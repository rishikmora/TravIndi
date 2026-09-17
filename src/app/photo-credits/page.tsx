import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, PageShell } from '@/components/app/PageShell';
import { destinations } from '@/data/destinations';
import { getDestinationPhotos, type Photo } from '@/data/media/photos';
import en from '@/i18n/locales/en';

export const metadata: Metadata = {
  title: en.meta.titles.photoCredits,
  description: 'The photographers and licences behind the destination photographs on TravIndi.',
  alternates: { canonical: '/photo-credits' },
};

const httpsOnly = (url: string | null) => (url?.startsWith('https://') ? url : undefined);
const titleOf = (photo: Photo) => photo.title.replace(/\.(jpe?g|png|tiff?|webp)$/i, '').replace(/_/g, ' ');

export default function PhotoCreditsPage() {
  const sections = destinations.flatMap((destination) => {
    const set = getDestinationPhotos(destination.slug);
    if (!set) return [];
    const photos = [set.hero, ...set.gallery, ...Object.values(set.attractions)].filter((photo, index, all) => all.findIndex((p) => p.title === photo.title) === index);
    return [{ destination, photos }];
  });

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="About"
        title="Photo credits"
        description="Destination photographs come from Wikimedia Commons — most are community-selected Featured or Quality pictures — and are used under the free licences their photographers chose. Thank you to every one of them."
      />
      <div className="grid gap-8">
        {sections.map(({ destination, photos }) => (
          <section key={destination.slug} aria-labelledby={`credits-${destination.slug}`} className="grid gap-2 border-t border-[var(--hairline)] pt-6">
            <h2 id={`credits-${destination.slug}`} className="text-[1.25rem] font-semibold">
              <Link href={`/destinations/${destination.slug}`} className="underline-offset-4 hover:underline">
                {destination.name}
              </Link>
            </h2>
            <ul className="grid gap-1.5 text-[0.9375rem]">
              {photos.map((photo) => {
                const licence = httpsOnly(photo.licence_url);
                return (
                  <li key={photo.title}>
                    <a href={httpsOnly(photo.source_url)} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                      {titleOf(photo)}
                    </a>
                    <span className="text-[var(--text-muted)]">
                      {' '}
                      by {photo.author} ·{' '}
                      {licence ? (
                        <a href={licence} target="_blank" rel="license noopener noreferrer" className="underline underline-offset-2">
                          {photo.licence}
                        </a>
                      ) : (
                        photo.licence
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
