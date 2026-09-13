'use client';

import { SceneVisual } from '@/components/media/SceneVisual';
import { chapters } from '@/data/journey';
import { CHAPTER_STILLS } from '@/data/media/stills';
import { useJourneyStore } from '@/store/journey';
import { cn } from '@/utils/cn';

/**
 * The journey without WebGL or motion: each chapter's still (or vector art)
 * crossfades in place behind the same copy, so the story is identical.
 */
export function StaticBackdrop() {
  const active = useJourneyStore((s) => s.activeChapter);
  return (
    <div className="pointer-events-none fixed inset-0 h-lvh w-full" aria-hidden="true">
      {chapters.map((chapter, i) => (
        <div
          key={chapter.id}
          className={cn(
            'absolute inset-0 transition-opacity duration-[1200ms] ease-cinematic',
            i === active ? 'opacity-100' : 'opacity-0',
          )}
        >
          {Math.abs(i - active) <= 1 ? (
            <SceneVisual
              still={CHAPTER_STILLS[chapter.id]}
              accent={chapter.accent}
              sizes="100vw"
              priority={i === 0}
              className="absolute inset-0"
            />
          ) : null}
        </div>
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_100%,rgb(0_0_0/0.72),transparent_60%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/50 to-transparent" />
    </div>
  );
}
