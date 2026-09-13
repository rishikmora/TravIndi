'use client';

import Lenis from 'lenis';
import { type RefObject, useEffect } from 'react';
import { renderFrame } from '@/3d/core/frameBus';
import { runtime } from '@/3d/core/runtime';
import { setLenis } from '@/animations/scroll';
import { type ChapterBeatWindows, chapters, DEFAULT_BEATS } from '@/data/journey';
import { computeLayout, createJourneySample, sampleJourney } from '@/scenes/layout';
import { journeyScenes } from '@/scenes/timeline';
import { type LoadPhase, useJourneyStore } from '@/store/journey';

const INTRO_MS = 7200;
const INTRO_SKIP_MS = 1400;
/** Intro progress at which the hero title begins to reveal. */
const HERO_REVEAL_AT = 0.62;

interface Beat {
  el: HTMLElement;
  window: [number, number];
  state: string;
  hero: boolean;
}

interface IntroPlayback {
  start: number;
  from: number;
  duration: number;
  skipping: boolean;
}

/**
 * Drives the journey from scroll: smooth scrolling, layout, chapter sampling,
 * beat reveals, the auto-played intro and the loading lock.
 *
 * Everything per-frame runs inside one requestAnimationFrame: Lenis advances
 * first (emitting the scroll update synchronously), then the intro, then the
 * WebGL stage renders — so the camera never lags the scroll by a frame.
 */
export function useJourneyEngine(rootRef: RefObject<HTMLElement | null>, reducedMotion: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const store = useJourneyStore.getState;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-chapter]'));
    const beats: Beat[][] = sections.map((section, i) => {
      const windows: ChapterBeatWindows = { ...DEFAULT_BEATS, ...chapters[i]?.beats };
      return Array.from(section.querySelectorAll<HTMLElement>('[data-beat]')).map((el) => ({
        el,
        window: windows[el.dataset.beat as keyof ChapterBeatWindows] ?? windows.title,
        state: 'init',
        hero: i === 0,
      }));
    });
    const transitions = journeyScenes.map((scene) => scene.transitionIn);
    const sample = createJourneySample();
    const mobile = window.matchMedia('(max-width: 767px)');
    // Written directly each frame: one element's transform instead of a custom
    // property on the journey root, which restyled every chapter on every frame.
    const progressBar = root.querySelector<HTMLElement>('[data-journey-progress-bar]');

    let lenis: Lenis | null = null;
    const currentScroll = () => (lenis ? lenis.scroll : window.scrollY);

    const measure = () => {
      const vh = window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
      const lengths = chapters.map((c) => (mobile.matches ? c.mobileLength : c.length));
      sections.forEach((section, i) => {
        section.style.height = `${Math.round(lengths[i]! * vh)}px`;
      });
      const top = root.getBoundingClientRect().top + window.scrollY;
      runtime.layout = computeLayout(lengths, vh, top);
    };

    const setBeat = (beat: Beat, state: string) => {
      if (beat.state === state) return;
      beat.state = state;
      beat.el.dataset.reveal = state;
    };

    const updateBeats = () => {
      const layout = runtime.layout;
      if (!layout) return;
      const local = runtime.scroll - layout.journeyTop;
      const active = runtime.textChapter;
      for (let i = 0; i < sections.length; i++) {
        const nodes = beats[i]!;
        if (Math.abs(i - active) > 1) {
          for (const beat of nodes) if (beat.state !== '' && beat.state !== 'init') setBeat(beat, '');
          continue;
        }
        const t = (local - layout.tops[i]!) / layout.heights[i]!;
        for (const beat of nodes) {
          let state = t < beat.window[0] ? '' : t <= beat.window[1] ? 'in' : 'out';
          if (beat.hero && state === 'in' && runtime.intro < HERO_REVEAL_AT) state = '';
          setBeat(beat, state);
        }
      }
    };

    let lastProgress = '';
    const update = (scrollY: number) => {
      const layout = runtime.layout;
      if (!layout) return;
      sampleJourney(scrollY, layout, transitions, sample);
      runtime.scroll = scrollY;
      runtime.progress = sample.progress;
      runtime.chapter = sample.chapter;
      runtime.chapterT = sample.chapterT;
      runtime.textChapter = sample.textChapter;
      runtime.textT = sample.textT;
      Object.assign(runtime.transition, sample.transition);

      const s = store();
      s.setSceneChapter(sample.chapter);
      s.setActiveChapter(sample.textChapter);
      s.setStageVisible(scrollY - layout.journeyTop < layout.total);
      const progress = sample.progress.toFixed(4);
      if (progressBar && progress !== lastProgress) {
        lastProgress = progress;
        progressBar.style.transform = `scaleX(${progress})`;
      }
      updateBeats();
    };

    measure();

    if (!reducedMotion) {
      // `autoRaf: false`: Lenis is advanced from the shared frame below.
      lenis = new Lenis({ autoRaf: false, lerp: 0.08, smoothWheel: true, syncTouch: false, wheelMultiplier: 0.9 });
      lenis.on('scroll', (instance: Lenis) => {
        runtime.velocity = instance.velocity;
        update(instance.scroll);
      });
    }
    setLenis(lenis);

    const onNativeScroll = () => update(window.scrollY);
    if (!lenis) window.addEventListener('scroll', onNativeScroll, { passive: true });

    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Ignore height jitter from collapsing mobile browser toolbars.
      if (w === lastWidth && Math.abs(h - lastHeight) < 120) return;
      lastWidth = w;
      lastHeight = h;
      measure();
      lenis?.resize();
      update(currentScroll());
    };
    window.addEventListener('resize', onResize);

    const onPointer = (event: PointerEvent) => {
      runtime.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      runtime.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    update(currentScroll());

    const skipByUrl = new URLSearchParams(window.location.search).get('intro') === 'skip';
    let intro: IntroPlayback | null = null;
    const startIntro = () => {
      if (runtime.intro >= 1 || intro) return;
      if (reducedMotion || skipByUrl || currentScroll() > 40) {
        runtime.intro = 1;
        updateBeats();
        return;
      }
      store().setIntroPlaying(true);
      intro = { start: performance.now(), from: runtime.intro, duration: INTRO_MS * (1 - runtime.intro), skipping: false };
    };
    const advanceIntro = (now: number) => {
      if (!intro) return;
      if (!intro.skipping && (currentScroll() > 8 || runtime.introSkipRequested)) {
        intro.skipping = true;
        intro.from = runtime.intro;
        intro.start = now;
        intro.duration = INTRO_SKIP_MS;
      }
      const k = Math.min(1, Math.max(0, now - intro.start) / Math.max(1, intro.duration));
      const eased = intro.skipping ? 1 - (1 - k) ** 3 : k;
      runtime.intro = intro.from + (1 - intro.from) * eased;
      updateBeats();
      if (k >= 1) {
        intro = null;
        runtime.introSkipRequested = false;
        store().setIntroPlaying(false);
      }
    };

    let frameId = 0;
    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      lenis?.raf(now);
      advanceIntro(now);
      renderFrame(now);
    };
    frameId = requestAnimationFrame(frame);

    const applyPhase = (phase: LoadPhase) => {
      const html = document.documentElement;
      if (phase === 'entered') {
        html.classList.remove('journey-locked');
        lenis?.start();
        startIntro();
      } else {
        html.classList.add('journey-locked');
        lenis?.stop();
      }
    };
    applyPhase(store().loadPhase);
    const unsubscribe = useJourneyStore.subscribe((state, previous) => {
      if (state.loadPhase !== previous.loadPhase) applyPhase(state.loadPhase);
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(frameId);
      intro = null;
      store().setIntroPlaying(false);
      window.removeEventListener('scroll', onNativeScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.classList.remove('journey-locked');
      lenis?.destroy();
      setLenis(null);
    };
  }, [rootRef, reducedMotion]);
}
