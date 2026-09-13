import Link from 'next/link';
import { SceneVisual } from '@/components/media/SceneVisual';
import { ClockIcon, MapPinIcon } from '@/components/ui/icons';
import { getDestination } from '@/data/destinations';
import { EXPERIENCE_CATEGORY_LABELS } from '@/data/experiences';
import type { Experience } from '@/data/types';
import { formatMonthRange } from '@/utils/format';

export function ExperienceCard({ experience }: { experience: Experience }) {
  const destination = getDestination(experience.destination);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[1.25rem] bg-[var(--surface-raised)] ring-1 ring-inset ring-[var(--hairline)] transition-[transform,box-shadow] duration-700 ease-cinematic hover:-translate-y-1 hover:shadow-[0_28px_60px_-36px_rgb(0_0_0/0.55)]">
      <div className="relative aspect-[16/10] overflow-hidden">
        <div className="absolute inset-0 transition-transform duration-[1400ms] ease-cinematic group-hover:scale-[1.04]">
          <SceneVisual
            still={experience.still}
            accent={destination?.accent}
            className="absolute inset-0"
            sizes="(max-width: 768px) 92vw, 33vw"
          />
        </div>
        <span className="label absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-paper backdrop-blur-md">
          {EXPERIENCE_CATEGORY_LABELS[experience.category]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[1.25rem] font-semibold leading-snug tracking-[-0.02em]">
          <Link
            href={destination ? `/destinations/${destination.slug}#experiences` : '/experiences'}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {experience.name}
          </Link>
        </h3>
        <p className="mt-2 flex-1 text-pretty text-[0.95rem] leading-relaxed text-[var(--text-muted)]">
          {experience.summary}
        </p>
        <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem] text-[var(--text-subtle)]">
          {destination ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Where</dt>
              <MapPinIcon size={15} />
              <dd>{destination.name}</dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Duration</dt>
            <ClockIcon size={15} />
            <dd>{experience.duration}</dd>
          </div>
          <div>
            <dt className="sr-only">Best months</dt>
            <dd>{formatMonthRange(experience.bestMonths)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
