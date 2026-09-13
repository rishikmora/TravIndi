import { DestinationTile } from '@/components/destinations/DestinationTile';
import { ButtonLink } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { hiddenGems, popularDestinations } from '@/data/destinations';
import { HomeReturningPanel } from './HomeReturningPanel';
import { HomeTrustBand } from './HomeTrustBand';

const STORY = [
  {
    label: 'You',
    title: 'It starts with who’s travelling',
    body: 'Parents who can’t walk far, a first solo trip, children who need breaks. The plan begins with people, not places.',
  },
  {
    label: 'Intent',
    title: 'Say it your way',
    body: 'Describe the trip in a sentence. We show exactly what we understood, and ask when something isn’t clear.',
  },
  {
    label: 'Planning',
    title: 'Planned for you, checked by you',
    body: 'TravIndi’s planning service builds the itinerary and checks timings and opening days. Nothing is booked or changed without you.',
  },
  {
    label: 'Journey',
    title: 'A day-by-day plan with reasons',
    body: 'Every stop says why it’s there. Costs we don’t know are marked “Cost unavailable”, never guessed.',
  },
  {
    label: 'Live change',
    title: 'When something changes, you hear first',
    body: 'Crowds, closures or delays reported on your route arrive as a travel update, with where the information came from and how recent it is.',
  },
  {
    label: 'Adaptation',
    title: 'Compare, then choose',
    body: 'See your current plan beside the suggestion and its impact on time and cost. Keep what you have if you prefer — every version is saved.',
  },
  {
    label: 'Safety',
    title: 'Safety that tells the truth',
    body: 'Share your location for as long as you choose. SOS shows exactly who received your alert, and reminds you to call 112.',
  },
];

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
            <p className="label text-[var(--text-subtle)]">How TravIndi works</p>
            <h2 id="story-title" className="text-balance text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1] tracking-[-0.04em]">
              One journey, planned with you and kept safe along the way
            </h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-2">
            {STORY.map((step, index) => (
              <Reveal as="li" key={step.label} delay={index * 50} className={index === STORY.length - 1 ? 'md:col-span-2' : undefined}>
                <article className="surface-card grid h-full gap-3 p-6 md:p-7">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-navy font-mono text-[0.875rem] font-semibold text-[var(--color-gold)]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="label text-[var(--tone-accent-fg)]">{step.label}</span>
                  </div>
                  <h3 className="text-[1.375rem] font-semibold leading-snug tracking-[-0.02em]">{step.title}</h3>
                  <p className="text-[1.0625rem] leading-relaxed text-[var(--text-muted)]">{step.body}</p>
                </article>
              </Reveal>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/trips/new" variant="accent" size="lg">
              Plan my journey
            </ButtonLink>
            <ButtonLink href="/safety" variant="secondary" size="lg">
              Visit the safety centre
            </ButtonLink>
          </div>
        </div>
      </section>

      <div className="theme-dark" data-nav-theme="dark">
        <section aria-labelledby="popular-title" className="pb-24 pt-28 md:pt-36">
          <div className="page-gutter">
            <SectionHeading
              id="popular-title"
              eyebrow="Popular destinations"
              title="Where most journeys begin"
              description="The places travellers return to again and again — each one a doorway to its region."
              action={{ href: '/destinations', label: 'All destinations' }}
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
              eyebrow="Hidden gems"
              title="The India most itineraries miss"
              description="Root bridges, crater lakes and canyon forts — worth the extra miles."
              action={{ href: '/destinations', label: 'Explore all destinations' }}
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
