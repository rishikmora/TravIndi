import type { TransitionType } from '@/scenes/types';

export interface JourneyLayout {
  viewportHeight: number;
  /** Document offset of the journey container, in px. */
  journeyTop: number;
  /** Chapter tops relative to the journey container, in px. */
  tops: number[];
  heights: number[];
  total: number;
}

export interface TransitionSample {
  /** Chapter being entered. */
  index: number;
  type: TransitionType;
  /** 0 → 1 → 0 across the boundary. */
  amount: number;
  /** −1 before the boundary, +1 after. */
  side: -1 | 1;
}

/**
 * Mutable, frame-level journey state shared between the DOM scroll controller
 * and the WebGL scene. Deliberately outside React: it changes every frame and
 * must never cause re-renders.
 */
export const runtime = {
  scroll: 0,
  velocity: 0,
  /** 0–1 across the whole journey. */
  progress: 0,
  /** Chapter whose 3D set is on screen. */
  chapter: 0,
  /** Local scene time in that chapter, 0–1. */
  chapterT: 0,
  /** Chapter whose copy is pinned on screen (can lag the 3D chapter slightly). */
  textChapter: 0,
  textT: 0,
  transition: { index: 0, type: 'none', amount: 0, side: 1 } as TransitionSample,
  /** Auto-played intro, 0–1. */
  intro: 0,
  /** Set to fast-forward the intro (skip button, scrolling). */
  introSkipRequested: false,
  pointer: { x: 0, y: 0, sx: 0, sy: 0 },
  layout: null as JourneyLayout | null,
  /** False while the journey is scrolled out of view. */
  visible: true,
  elapsed: 0,
  /** Frames rendered since the stage mounted. */
  frame: 0,
};

export type JourneyRuntime = typeof runtime;
