'use client';

import type { CSSProperties } from 'react';
import { scrollToChapter } from '@/animations/scroll';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ArrowRightIcon } from '@/components/ui/icons';
import { HeroTripComposer } from '@/components/home/HeroTripComposer';
import { SplitText } from '@/components/ui/SplitText';
import type { ChapterCopy } from '@/data/journey';
import { useTranslation } from '@/i18n/react';

const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as CSSProperties;

export function HeroChapter({ chapter }: { chapter: ChapterCopy }) {
  const { t } = useTranslation();
  const copy = `journey.chapters.${chapter.id}` as const;
  return (
    <section
      data-chapter={0}
      id="journey-start"
      aria-labelledby="hero-title"
      className="journey-chapter relative"
      style={{ '--len': chapter.length, '--len-mobile': chapter.mobileLength } as CSSProperties}
    >
      <div className="sticky top-0 flex h-lvh w-full flex-col items-center justify-center overflow-hidden text-center page-gutter">
        <div
          data-beat="title"
          data-reveal=""
          aria-hidden="true"
          className="reveal-fade pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_52%,rgb(0_0_0/0.32),transparent_75%)]"
        />
        <p data-beat="title" data-reveal="" className="label relative text-paper/60" style={delay(0)}>
          {t.dynamic(`${copy}.location`)}
        </p>
        <h1 id="hero-title" data-beat="title" data-reveal="" className="display-hero mt-6 scene-scrim" style={delay(120)}>
          <SplitText text={t.dynamic(`${copy}.subject`)} />
        </h1>
        <p
          data-beat="title"
          data-reveal=""
          className="editorial mt-6 text-[clamp(1.4rem,2.7vw,2.5rem)] italic text-paper/90 scene-scrim"
          style={delay(650)}
        >
          {t.dynamic(`${copy}.line`)}
        </p>
        <div
          data-beat="title"
          data-reveal=""
          data-interactive=""
          className="mt-10 flex w-full flex-col items-center gap-4"
          style={delay(950)}
        >
          <HeroTripComposer />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="glass" size="md" onClick={() => scrollToChapter(1)}>
              {t('journey.hero.explore')}
              <ArrowRightIcon size={16} />
            </Button>
            <ButtonLink href="/destinations" variant="ghost" size="md" className="text-paper hover:bg-white/10">
              {t('journey.hero.browse')}
            </ButtonLink>
          </div>
        </div>

        <div
          data-beat="title"
          data-reveal=""
          className="absolute bottom-[clamp(1.5rem,5vh,3rem)] left-1/2 flex -translate-x-1/2 flex-col items-center gap-3"
          style={delay(1400)}
          aria-hidden="true"
        >
          <span className="label text-paper/50">{t('journey.hero.scroll')}</span>
          <span className="relative block h-10 w-px overflow-hidden bg-paper/15">
            <span className="absolute inset-0 animate-[scroll-cue_2.2s_var(--ease-cinematic)_infinite] bg-paper/80" />
          </span>
        </div>
        <p className="sr-only">{t.dynamic(`${copy}.description`)}</p>
      </div>
    </section>
  );
}
