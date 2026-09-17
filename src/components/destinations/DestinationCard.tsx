'use client';

import Image from 'next/image';
import Link from 'next/link';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTranslation } from '@/i18n/react';
import { isRemoteImage, isTrustedImageUrl } from '@/lib/media/trusted';
import type { DestinationSummary } from '@/types/domain';
import { cn } from '@/utils/cn';
import { categoryLabel, regionLabel } from './labels';

export function DestinationCard({ destination, className, priority }: { destination: DestinationSummary; className?: string; priority?: boolean }) {
  const { t } = useTranslation();
  const image = destination.heroImage;
  return (
    <article className={cn('surface-card group relative flex flex-col overflow-hidden', className)}>
      <div className="relative aspect-[4/3] overflow-hidden bg-navy">
        {image && isTrustedImageUrl(image.url) ? (
          <Image
            src={image.urlSmall ?? image.url}
            alt={image.alt}
            fill
            unoptimized={isRemoteImage(image.url)}
            priority={priority}
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 480px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 ease-cinematic group-hover:scale-[1.04]"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(90%_70%_at_30%_20%,rgb(212_166_73/0.35),transparent_60%),linear-gradient(135deg,#1c2b4a,#a84a2a)]" />
        )}
        <div className="absolute left-3 top-3">
          <StatusPill className="bg-ivory/95 text-navy shadow-sm">{categoryLabel(t, destination.category)}</StatusPill>
        </div>
      </div>
      <div className="grid flex-1 content-start gap-1 p-4">
        <h3 className="text-[1.125rem] font-semibold tracking-[-0.015em]">
          <Link href={`/destinations/${destination.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {destination.name}
          </Link>
        </h3>
        <p className="text-[0.875rem] text-[var(--text-muted)]">
          {destination.state} · {regionLabel(t, destination.region)}
        </p>
        <p className="mt-1 text-[0.9375rem] leading-snug">{destination.tagline}</p>
      </div>
    </article>
  );
}
