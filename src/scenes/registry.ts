import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import type { SetId } from './types';

export interface SetComponentProps {
  setId: SetId;
}

type SetModule = { default: ComponentType<SetComponentProps> };

/**
 * Every scene world is its own code-split chunk, fetched only as the journey
 * approaches it. Sets not listed here fall back to the India map flyover.
 */
const loaders: Partial<Record<SetId, () => Promise<SetModule>>> = {
  india: () => import('./sets/india/IndiaSet'),
};

const components = new Map<SetId, LazyExoticComponent<ComponentType<SetComponentProps>>>();

export function hasSet(id: SetId): boolean {
  return Boolean(loaders[id]);
}

export function getSetComponent(id: SetId) {
  const loader = loaders[id];
  if (!loader) return null;
  let component = components.get(id);
  if (!component) {
    component = lazy(loader);
    components.set(id, component);
  }
  return component;
}

export function preloadSet(id: SetId) {
  void loaders[id]?.();
}
