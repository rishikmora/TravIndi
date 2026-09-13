import type { TransitionType } from '@/scenes/types';

/** Integer codes consumed by the grade/transition shader. */
export const TRANSITION_CODES: Record<TransitionType, number> = {
  none: 0,
  fog: 1,
  flash: 2,
  portal: 3,
  dissolve: 4,
  sand: 5,
  water: 6,
  petals: 7,
  clouds: 8,
};

/** Fallback colours when a chapter's transition does not specify one. */
export const DEFAULT_TRANSITION_COLORS: Record<TransitionType, string> = {
  none: '#000000',
  fog: '#d8d2c8',
  flash: '#fff1d6',
  portal: '#030202',
  dissolve: '#050403',
  sand: '#d9a86a',
  water: '#1d4f5c',
  petals: '#f0a63a',
  clouds: '#f3eee6',
};
