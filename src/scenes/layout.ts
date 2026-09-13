import type { JourneyLayout, TransitionSample } from '@/3d/core/runtime';
import { clamp, smoothstep } from '@/utils/math';
import type { TransitionSpec } from './types';

/** Share of a viewport by which 3D boundaries lead the pinned copy. */
const SCENE_LEAD = 0.5;

export function computeLayout(lengths: number[], viewportHeight: number, journeyTop: number): JourneyLayout {
  const tops: number[] = [];
  const heights: number[] = [];
  let cursor = 0;
  for (const length of lengths) {
    const h = Math.round(length * viewportHeight);
    tops.push(cursor);
    heights.push(h);
    cursor += h;
  }
  return { viewportHeight, journeyTop, tops, heights, total: cursor };
}

function findIndex(tops: number[], position: number): number {
  let lo = 0;
  let hi = tops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid]! <= position) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface JourneySample {
  progress: number;
  chapter: number;
  chapterT: number;
  textChapter: number;
  textT: number;
  transition: TransitionSample;
}

/**
 * Maps a document scroll position to chapter/time. Copy uses the raw section
 * positions; the 3D scene leads by half a viewport so that scene cuts land in
 * the middle of the copy hand-off, where transition effects hide them.
 */
export function sampleJourney(
  scrollY: number,
  layout: JourneyLayout,
  transitions: readonly TransitionSpec[],
  out: JourneySample,
): JourneySample {
  const { viewportHeight: vh, tops, heights, total } = layout;
  const local = scrollY - layout.journeyTop;

  out.progress = clamp(local / Math.max(1, total - vh));

  const textChapter = findIndex(tops, clamp(local, 0, total - 1));
  out.textChapter = textChapter;
  out.textT = clamp((local - tops[textChapter]!) / heights[textChapter]!, 0, 1.5);

  // Ease the lead in over the first half viewport so chapter one starts at t=0.
  const lead = vh * SCENE_LEAD * clamp(local / (vh * SCENE_LEAD));
  const scene = clamp(local + lead, 0, total - 1);
  const chapter = findIndex(tops, scene);
  out.chapter = chapter;
  out.chapterT = clamp((scene - tops[chapter]!) / heights[chapter]!);

  // Transition envelope around the nearest boundary.
  const nextIndex = Math.min(chapter + 1, tops.length - 1);
  const prevBoundary = tops[chapter]!;
  const nextBoundary = tops[nextIndex]!;
  const toPrev = scene - prevBoundary;
  const toNext = nextBoundary - scene;
  const useNext = nextIndex !== chapter && toNext < toPrev;
  const incoming = useNext ? nextIndex : chapter;
  const spec = transitions[incoming];
  const width = (spec?.width ?? 0.4) * vh;
  const distance = useNext ? toNext : toPrev;

  out.transition.index = incoming;
  out.transition.type = incoming === 0 ? 'none' : (spec?.type ?? 'none');
  out.transition.amount = incoming === 0 ? 0 : 1 - smoothstep(0, width, distance);
  out.transition.side = useNext ? -1 : 1;
  return out;
}

export function createJourneySample(): JourneySample {
  return {
    progress: 0,
    chapter: 0,
    chapterT: 0,
    textChapter: 0,
    textT: 0,
    transition: { index: 0, type: 'none', amount: 0, side: 1 },
  };
}
