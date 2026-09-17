import { DestinationTile } from '@/components/destinations/DestinationTile';
import { ButtonLink } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { hiddenGems, popularDestinations } from '@/data/destinations';
import { T } from '@/i18n/react';
import { HomeReturningPanel } from './HomeReturningPanel';
import { HomeTrustBand } from './HomeTrustBand';

const STORY = ['you', 'intent', 'planning', 'journey', 'liveChange', 'adaptation', 'safety'] as const;

/** Everything after the cinematic journey: the TravIndi story, discovery and a way to begin. */
export function AfterJourney() {
  const popular = popularDestinations.slice(0, 8);
  const [heroGem, ...gems] = hiddenGems;

  return (
    <div className="relative z-10">
      <HomeReturningPanel />

      <section aria-labelledby="story-title" className="theme-app py-24 page-gutter md:py-32" data-nav-theme="light">
        <div className="mx-auto grid max-w-6xl gap-14">
          <div className="grid max-w-2xl gap-4">
            <p className="label text-[var(--text-subtle)]">
              <T k="home.story.eyebrow" />
            </p>
            <h2 id="story-title" className="text-balance text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1] tracking-[-0.04em]">
              <T k="home.story.title" />
            </h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-2">
            {STORY.map((step, index) => (
              <Reveal as="li" key={step} delay={index * 50} className={index === STORY.length - 1 ? 'md:col-span-2' : undefined}>
                <article className="surface-card grid h-full gap-3 p-6 md:p-7">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-navy font-mono text-[0.875rem] font-semibold text-[var(--color-gold)]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="label text-[var(--tone-accent-fg)]">
                      <T k={`home.story.steps.${step}.label`} />
                    </span>
                  </div>
                  <h3 className="text-[1.375rem] font-semibold leading-snug tracking-[-0.02em]">
                    <T k={`home.story.steps.${step}.title`} />
                  </h3>
                  <p className="text-[1.0625rem] leading-relaxed text-[var(--text-muted)]">
                    <T k={`home.story.steps.${step}.body`} />
                  </p>
                </article>
              </Reveal>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/trips/new" variant="accent" size="lg">
              <T k="home.story.plan" />
            </ButtonLink>
            <ButtonLink href="/safety" variant="secondary" size="lg">
              <T k="home.story.safety" />
            </ButtonLink>
          </div>
        </div>
      </section>

      <div className="theme-dark" data-nav-theme="dark">
        <section aria-labelledby="popular-title" className="pb-24 pt-28 md:pt-36">
          <div className="page-gutter">
            <SectionHeading
              id="popular-title"
              eyebrow={<T k="home.popular.eyebrow" />}
              title={<T k="home.popular.title" />}
              description={<T k="home.popular.description" />}
              action={{ href: '/destinations', label: <T k="home.popular.action" /> }}
            />
          </div>
          <ul className="mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 page-gutter [scrollbar-width:none]">
            {popular.map((destination, i) => (
              <Reveal as="li" key={destination.slug} delay={i * 60} className="shrink-0 snap-start">
                <DestinationTile destination={destination} className="h-[26rem] w-[min(78vw,19rem)]" />
              </Reveal>
            ))}
          </ul>
        </section>

        {heroGem ? (
          <section aria-labelledby="hidden-title" className="py-24 page-gutter">
            <SectionHeading
              id="hidden-title"
              eyebrow={<T k="home.hidden.eyebrow" />}
              title={<T k="home.hidden.title" />}
              description={<T k="home.hidden.description" />}
              action={{ href: '/destinations', label: <T k="home.hidden.action" /> }}
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2 md:grid-rows-2 lg:grid-cols-[1.35fr_1fr_1fr]">
              <Reveal className="md:row-span-2">
                <DestinationTile destination={heroGem} size="large" className="h-[28rem] md:h-full md:min-h-[36rem]" />
              </Reveal>
              {gems.slice(0, 4).map((gem, i) => (
                <Reveal key={gem.slug} delay={80 + i * 60}>
                  <DestinationTile destination={gem} className="h-[17rem]" />
                </Reveal>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="trust-title" className="py-24 page-gutter md:pb-32">
          <HomeTrustBand />
        </section>
      </div>
    </div>
  );
}
