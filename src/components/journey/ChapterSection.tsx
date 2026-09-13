import Link from 'next/link';
import type { CSSProperties } from 'react';
import { DestinationChip } from '@/components/destinations/DestinationChip';
import { ButtonLink } from '@/components/ui/Button';
import { ArrowRightIcon } from '@/components/ui/icons';
import { SplitText } from '@/components/ui/SplitText';
import { findAttraction, getDestinations } from '@/data/destinations';
import type { ChapterCopy } from '@/data/journey';
import { getState } from '@/data/states';
import { cn } from '@/utils/cn';

const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

interface ChapterSectionProps {
  chapter: ChapterCopy;
  index: number;
}

/**
 * One chapter of copy, pinned over the 3D world while its scroll range plays.
 * Elements are grouped into beats that the journey engine reveals in order.
 */
export function ChapterSection({ chapter, index }: ChapterSectionProps) {
  if (chapter.id === 'plan') return <FinaleChapter chapter={chapter} index={index} />;

  const end = chapter.align === 'end';
  const center = chapter.align === 'center';
  const feature = chapter.feature ? findAttraction(chapter.feature.destination, chapter.feature.attraction) : undefined;
  const featureState = feature ? getState(feature.destination.state) : undefined;
  const destinations = getDestinations(chapter.destinations);
  const titleId = `chapter-${chapter.id}-title`;

  return (
    <section
      data-chapter={index}
      id={`chapter-${chapter.id}`}
      aria-labelledby={titleId}
      className="journey-chapter relative"
      style={{ '--len': chapter.length, '--len-mobile': chapter.mobileLength } as CSSProperties}
    >
      <div className="sticky top-0 h-lvh w-full overflow-hidden">
        {/* A soft shadow on the copy's side keeps type legible over bright frames. */}
        <div
          data-beat="title"
          data-reveal=""
          aria-hidden="true"
          className={cn(
            'reveal-fade pointer-events-none absolute inset-0',
            end
              ? 'bg-[radial-gradient(85%_75%_at_100%_100%,rgb(0_0_0/0.55),transparent_70%)]'
              : center
                ? 'bg-[radial-gradient(80%_70%_at_50%_100%,rgb(0_0_0/0.5),transparent_70%)]'
                : 'bg-[radial-gradient(85%_75%_at_0%_100%,rgb(0_0_0/0.55),transparent_70%)]',
          )}
        />
        <div
          data-beat="cards"
          data-reveal=""
          aria-hidden="true"
          className="reveal-fade pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/55 to-transparent"
        />
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex page-gutter pb-[clamp(5.5rem,15vh,9.5rem)] md:pr-[max(var(--page-gutter),7rem)]',
            end ? 'justify-end text-right' : center ? 'justify-center text-center' : 'justify-start',
          )}
        >
          <div className="scene-copy max-w-[min(44rem,100%)]">
            <p data-beat="title" data-reveal="" className="label text-paper/65">
              <span className="text-paper">{chapter.number}</span>
              <span className="mx-2 text-paper/35">/</span>
              {chapter.name}
            </p>
            <h2 id={titleId} data-beat="title" data-reveal="" className="display-xl mt-4 scene-scrim" style={delay(80)}>
              <SplitText text={chapter.subject} />
            </h2>
            <p
              data-beat="title"
              data-reveal=""
              className="editorial mt-5 text-[clamp(1.35rem,2.3vw,2.15rem)] italic text-paper/90 scene-scrim"
              style={delay(420)}
            >
              {chapter.line}
            </p>
            {chapter.body ? (
              <p
                data-beat="body"
                data-reveal=""
                className={cn(
                  'body-lg mt-5 max-w-[31rem] text-pretty text-paper/78 scene-scrim',
                  end && 'ml-auto',
                  center && 'mx-auto',
                )}
                style={delay(650)}
              >
                {chapter.body}
              </p>
            ) : null}
          </div>
        </div>

        {chapter.stat ? (
          <div
            data-beat="stat"
            data-reveal=""
            className={cn(
              'absolute top-[calc(var(--nav-height)+10vh)] page-gutter',
              end ? 'left-0' : 'right-0 text-right md:right-[max(var(--page-gutter),6rem)]',
            )}
          >
            <p className="label text-paper/60">{chapter.stat.label}</p>
            <p className="mt-2 text-[clamp(2.25rem,4.6vw,4.5rem)] font-semibold leading-none tracking-[-0.045em] scene-scrim">
              {chapter.stat.value}
            </p>
          </div>
        ) : null}

        {feature && chapter.feature ? (
          <div
            data-beat="feature"
            data-reveal=""
            data-interactive=""
            className={cn(
              'absolute top-[calc(var(--nav-height)+8vh)] max-w-md page-gutter',
              end ? 'left-0' : 'right-0 text-right md:right-[max(var(--page-gutter),6rem)]',
            )}
          >
            <p className="label text-paper/55">Featured</p>
            <p className="mt-3 text-[clamp(1.9rem,3.6vw,3.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.035em] scene-scrim">
              {feature.attraction.name}
            </p>
            <p className="mt-2 text-[0.95rem] text-paper/75">
              {feature.destination.name}
              {featureState ? `, ${featureState.name}` : ''}
            </p>
            <p className="editorial mt-3 text-[1.35rem] italic text-paper/90">“{chapter.feature.line}”</p>
            <ButtonLink
              href={`/destinations/${feature.destination.slug}#${feature.attraction.slug}`}
              variant="glass"
              size="sm"
              className="mt-5"
            >
              Explore
              <ArrowRightIcon size={15} />
            </ButtonLink>
          </div>
        ) : null}

        {destinations.length > 0 ? (
          <div
            data-beat="cards"
            data-reveal=""
            data-interactive=""
            className="absolute inset-x-0 bottom-0 pb-[clamp(1.25rem,4.5vh,2.75rem)]"
          >
            <div className="flex items-baseline justify-between gap-6 page-gutter md:pr-[max(var(--page-gutter),7rem)]">
              <p className="label text-paper/70">Journeys through {chapter.subject}</p>
              <Link href="/destinations" className="label rounded-full text-paper/60 transition-colors hover:text-paper">
                All destinations
              </Link>
            </div>
            <ul className="mt-4 flex gap-3 overflow-x-auto pb-1 page-gutter [scrollbar-width:none] md:pr-[max(var(--page-gutter),7rem)]">
              {destinations.map((destination) => (
                <li key={destination.slug}>
                  <DestinationChip destination={destination} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="sr-only">{chapter.description}</p>
      </div>
    </section>
  );
}

function FinaleChapter({ chapter, index }: ChapterSectionProps) {
  return (
    <section
      data-chapter={index}
      id={`chapter-${chapter.id}`}
      aria-labelledby="chapter-plan-title"
      className="journey-chapter relative"
      style={{ '--len': chapter.length, '--len-mobile': chapter.mobileLength } as CSSProperties}
    >
      <div className="sticky top-0 flex h-lvh w-full flex-col items-center justify-center overflow-hidden text-center page-gutter">
        <p data-beat="title" data-reveal="" className="label text-paper/60">
          {chapter.number} / {chapter.name}
        </p>
        <h2 id="chapter-plan-title" data-beat="title" data-reveal="" className="display-hero mt-6 max-w-[14ch] scene-scrim" style={delay(100)}>
          <SplitText text={chapter.subject} />
        </h2>
        <p
          data-beat="title"
          data-reveal=""
          className="editorial mt-6 text-[clamp(1.35rem,2.4vw,2.2rem)] italic text-paper/88 scene-scrim"
          style={delay(700)}
        >
          {chapter.line}
        </p>
        <div data-beat="title" data-reveal="" data-interactive="" className="mt-10 flex flex-wrap justify-center gap-3" style={delay(1000)}>
          <ButtonLink href="/trips/new" size="lg">
            Plan my journey
            <ArrowRightIcon size={18} />
          </ButtonLink>
          <ButtonLink href="/destinations" variant="glass" size="lg">
            Explore India
          </ButtonLink>
        </div>
        <p className="sr-only">{chapter.description}</p>
      </div>
    </section>
  );
}
