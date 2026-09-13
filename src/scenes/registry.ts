import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import type { SetId } from './types';

export interface SetComponentProps {
  setId: SetId;
}

type SetModule = { default: ComponentType<SetComponentProps> };

const loadIndia = (): Promise<SetModule> => import('./sets/india/IndiaSet');

/**
 * Every scene world is its own code-split chunk, fetched only as the journey
 * approaches it. Sets not listed here fall back to the India map flyover.
 */
const loaders: Partial<Record<SetId, () => Promise<SetModule>>> = {
  india: loadIndia,
};

/** Lazy components, created once at module load so rendering never creates a component. */
export const SET_COMPONENTS: Partial<Record<SetId, LazyExoticComponent<ComponentType<SetComponentProps>>>> = {
  india: lazy(loadIndia),
};

export function hasSet(id: SetId): boolean {
  return Boolean(loaders[id]);
}

export function preloadSet(id: SetId) {
  void loaders[id]?.();
}
