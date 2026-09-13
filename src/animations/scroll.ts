import type Lenis from 'lenis';
import { runtime } from '@/3d/core/runtime';
import { easing } from '@/utils/math';

let lenis: Lenis | null = null;

export function setLenis(instance: Lenis | null) {
  lenis = instance;
}

export function getLenis() {
  return lenis;
}

interface ScrollOptions {
  immediate?: boolean;
  /** Seconds. Defaults to a duration proportional to the distance travelled. */
  duration?: number;
}

export function scrollToY(y: number, { immediate = false, duration }: ScrollOptions = {}) {
  const current = lenis ? lenis.scroll : window.scrollY;
  const viewport = window.innerHeight || 1;
  const travel = Math.abs(y - current) / viewport;
  const seconds = duration ?? Math.min(5.5, 1.1 + travel * 0.32);

  if (lenis) {
    lenis.scrollTo(y, { immediate, duration: seconds, easing: easing.inOutCubic, force: true });
  } else {
    window.scrollTo({ top: y, behavior: immediate ? 'auto' : 'smooth' });
  }
}

/** Travels to the moment a chapter's copy is fully pinned on screen. */
export function scrollToChapter(index: number, options?: ScrollOptions) {
  const layout = runtime.layout;
  if (!layout) return;
  const top = layout.tops[index];
  if (top === undefined) return;
  const offset = index === 0 ? 0 : layout.heights[index]! * 0.12;
  scrollToY(layout.journeyTop + top + offset, options);
}
