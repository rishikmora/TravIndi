'use client';

import { runtime } from '@/3d/core/runtime';
import { useTranslation } from '@/i18n/react';
import { useJourneyStore } from '@/store/journey';
import { cn } from '@/utils/cn';

/** Lets returning visitors fast-forward the opening sequence. */
export function SkipIntroButton() {
  const playing = useJourneyStore((s) => s.introPlaying);
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => {
        runtime.introSkipRequested = true;
      }}
      tabIndex={playing ? 0 : -1}
      aria-hidden={!playing}
      className={cn(
        'label fixed bottom-[clamp(1.25rem,4vh,2.5rem)] right-[var(--page-gutter)] z-40 rounded-full bg-black/20 px-4 py-2.5 text-paper/70 ring-1 ring-inset ring-white/15 backdrop-blur-md',
        'transition-[opacity,background-color,color] duration-700 hover:bg-black/40 hover:text-paper',
        playing ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {t('journey.skipIntro')}
    </button>
  );
}
