'use client';

import { useTranslation } from '@/i18n/react';
import type { Image as ImageModel } from '@/types/domain';
import { cn } from '@/utils/cn';

const httpsOnly = (url: string | null | undefined) => (url && url.startsWith('https://') ? url : null);

/** A photograph's author, licence and source — shown wherever the photo appears, as its licence requires. */
export function PhotoCredit({ image, compact = false, className }: { image: ImageModel; compact?: boolean; className?: string }) {
  const { t } = useTranslation();
  const attribution = image.attribution;
  if (!attribution) return null;
  const source = httpsOnly(attribution.sourceUrl);
  const licence = httpsOnly(attribution.licenceUrl);
  const byline = t('destinations.photo.by', { author: attribution.author });

  return (
    <p className={cn('text-[0.75rem] leading-snug', className)}>
      {source ? (
        <a href={source} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          {byline}
        </a>
      ) : (
        byline
      )}
      {' · '}
      {licence ? (
        <a href={licence} target="_blank" rel="license noopener noreferrer" className="underline-offset-2 hover:underline">
          {attribution.licence}
        </a>
      ) : (
        attribution.licence
      )}
      {!compact && ` · ${attribution.sourceName}`}
    </p>
  );
}
