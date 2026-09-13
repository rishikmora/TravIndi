'use client';

import { advance, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useJourneyStore } from '@/store/journey';
import { setFrameRenderer } from './frameBus';
import { runtime } from './runtime';
import { globalUniforms } from './uniforms';

/** Advances shared time, smooths pointer input, renders on the shared frame and reports the first frames. */
export function FrameDriver() {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const get = useThree((s) => s.get);
  const frames = useRef(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    // Development-only: expose the R3F root state for inspection.
    (window as unknown as Record<string, unknown>).__parikramaThree = get;
  }, [get]);

  useEffect(() => {
    globalUniforms.uResolution.value.set(size.width * dpr, size.height * dpr);
    globalUniforms.uPixelRatio.value = dpr;
  }, [size, dpr]);

  // The canvas runs no loop of its own (frameloop="never"). The journey's single
  // frame renders it right after scroll is applied, and skips it entirely while
  // the journey is scrolled out of view.
  useEffect(() => {
    setFrameRenderer((now) => {
      if (!useJourneyStore.getState().stageVisible) return;
      const state = get();
      const seconds = now / 1000;
      // After a pause (first frame, or scrolling back into the journey) resume
      // with a single frame's delta instead of the whole gap.
      const gap = seconds - state.clock.elapsedTime;
      if (gap > 0.25 || gap < 0) state.clock.elapsedTime = seconds - 1 / 60;
      advance(seconds, true, state);
    });
    return () => setFrameRenderer(null);
  }, [get]);

  useFrame((_, delta) => {
    const dt = Math.min(Math.max(delta, 0), 0.1);
    runtime.frame += 1;
    runtime.elapsed += dt;
    globalUniforms.uTime.value = runtime.elapsed;

    const k = 1 - Math.exp(-3.2 * dt);
    runtime.pointer.sx += (runtime.pointer.x - runtime.pointer.sx) * k;
    runtime.pointer.sy += (runtime.pointer.y - runtime.pointer.sy) * k;

    if (frames.current < 3) {
      frames.current += 1;
      if (frames.current === 3) {
        const store = useJourneyStore.getState();
        store.setFirstFrame();
        store.setLoadStep('environment', 1);
      }
    }
  }, -3);

  return null;
}
