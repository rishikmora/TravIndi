'use client';

import { scrollToChapter } from '@/animations/scroll';
import { chapters } from '@/data/journey';
import { useJourneyStore } from '@/store/journey';
import { cn } from '@/utils/cn';

/** Chapter index: orientation at a glance and direct travel between chapters. */
export function ProgressRail() {
  const active = useJourneyStore((s) => s.activeChapter);
  const phase = useJourneyStore((s) => s.loadPhase);
  const visible = useJourneyStore((s) => s.stageVisible);
  const hidden = phase !== 'entered' || !visible;

  return (
    <>
      <nav
        aria-label="Journey chapters"
        className={cn(
          'fixed right-[clamp(0.75rem,2vw,1.75rem)] top-1/2 z-40 hidden -translate-y-1/2 transition-opacity duration-700 md:block',
          hidden && 'pointer-events-none opacity-0',
        )}
      >
        <ol className="flex flex-col items-end gap-1">
          {chapters.map((chapter, i) => {
            const current = i === active;
            return (
              <li key={chapter.id}>
                <button
                  type="button"
                  onClick={() => scrollToChapter(i)}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Chapter ${chapter.number}: ${chapter.name}`}
                  className="group flex items-center gap-3 rounded-full py-1 pl-3 text-paper"
                >
                  <span className="label translate-x-1 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-80 group-focus-visible:translate-x-0 group-focus-visible:opacity-80">
                    {chapter.name}
                  </span>
                  <span
                    className={cn(
                      'block h-px transition-[width,background-color] duration-500 ease-cinematic',
                      current ? 'w-8 bg-paper' : 'w-3.5 bg-paper/35 group-hover:w-6 group-hover:bg-paper/70',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 h-[2px] origin-left bg-paper/80 transition-opacity duration-700 md:hidden',
          hidden && 'opacity-0',
        )}
        data-journey-progress-bar=""
        style={{ transform: 'scaleX(0)' }}
      />
    </>
  );
}
