'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { QUALITY_ORDER, type QualityLevel, profileDevice, recommendQuality } from '@/3d/core/quality';
import { runtime } from '@/3d/core/runtime';
import { globalUniforms, postState } from '@/3d/core/uniforms';
import { probeWebGL } from '@/3d/core/webgl';
import { chapters } from '@/data/journey';
import { useReducedMotion } from '@/hooks/useMotion';
import { useJourneyStore } from '@/store/journey';
import { usePreferences } from '@/store/preferences';
import { useQualityStore } from '@/store/quality';
import { ChapterSection } from './ChapterSection';
import { HeroChapter } from './HeroChapter';
import { LoadingScreen } from './LoadingScreen';
import { ProgressRail } from './ProgressRail';
import { SkipIntroButton } from './SkipIntroButton';
import { StaticBackdrop } from './StaticBackdrop';
import { useJourneyEngine } from './useJourneyEngine';

const Stage = dynamic(() => import('@/3d/core/Stage'), { ssr: false });

const isQualityLevel = (value: string | null): value is QualityLevel =>
  value !== null && (QUALITY_ORDER as readonly string[]).includes(value);

/**
 * Chooses how the journey is rendered: cinematic WebGL when the device and the
 * visitor's motion preference allow it, the static journey otherwise.
 */
function useRenderModeDecision(reducedMotion: boolean) {
  const setRenderMode = useJourneyStore((s) => s.setRenderMode);

  useEffect(() => {
    const decide = () => {
      const probe = probeWebGL();
      if (!probe.supported) return setRenderMode('static', 'webgl-unavailable');
      if (reducedMotion) return setRenderMode('static', 'reduced-motion');

      const profile = profileDevice(probe);
      const recommended = recommendQuality(profile);
      const quality = useQualityStore.getState();
      quality.setProfile(profile, recommended);

      const forced = new URLSearchParams(window.location.search).get('quality');
      const preference = usePreferences.getState().quality;
      if (isQualityLevel(forced)) quality.setLevel(forced, 'user');
      else if (preference !== 'auto') quality.setLevel(preference, 'user');

      setRenderMode('webgl');
    };

    if (usePreferences.persist.hasHydrated()) {
      decide();
      return;
    }
    return usePreferences.persist.onFinishHydration(decide);
  }, [reducedMotion, setRenderMode]);
}

export function Journey() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const renderMode = useJourneyStore((s) => s.renderMode);

  useRenderModeDecision(reducedMotion);
  useJourneyEngine(rootRef, reducedMotion);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    // Development-only handles for inspecting the engine from the console.
    (window as unknown as Record<string, unknown>).__parikrama = {
      runtime,
      post: postState,
      uniforms: globalUniforms,
      journey: useJourneyStore.getState,
      quality: useQualityStore.getState,
    };
  }, []);

  return (
    <div id="journey" ref={rootRef} className="theme-dark relative isolate" data-nav-theme="dark" data-render={renderMode}>
      {renderMode === 'webgl' ? <Stage eventSource={rootRef} /> : null}
      {renderMode === 'static' ? <StaticBackdrop /> : null}
      <LoadingScreen />
      <ProgressRail />
      <SkipIntroButton />
      {chapters.map((chapter, index) =>
        index === 0 ? (
          <HeroChapter key={chapter.id} chapter={chapter} />
        ) : (
          <ChapterSection key={chapter.id} chapter={chapter} index={index} />
        ),
      )}
    </div>
  );
}
