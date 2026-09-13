/**
 * The journey's single animation frame. Smooth scrolling, the intro, DOM beat
 * updates and the WebGL render all run from one requestAnimationFrame callback
 * in a fixed order, so every rendered frame shows the scroll position computed
 * in that same frame — no second loop racing the first.
 */
type FrameCallback = (now: number) => void;

let renderer: FrameCallback | null = null;

/** Registered by the stage; called after scroll has been applied for the frame. */
export function setFrameRenderer(callback: FrameCallback | null) {
  renderer = callback;
}

export function renderFrame(now: number) {
  renderer?.(now);
}
