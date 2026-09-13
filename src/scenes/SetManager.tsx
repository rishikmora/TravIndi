'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import type { Group, Object3D } from 'three';
import { runtime } from '@/3d/core/runtime';
import { useJourneyStore } from '@/store/journey';
import { useQualityStore } from '@/store/quality';
import { preloadSet, SET_COMPONENTS } from './registry';
import { getEffectiveScenes } from './timeline';
import type { SetId } from './types';

/**
 * Keeps only the sets near the current chapter mounted (always including the
 * next one, so it is loaded and its shaders compiled before it is needed).
 * Visibility is switched per frame from the runtime, not through React.
 */
export function SetManager() {
  const sceneChapter = useJourneyStore((s) => s.sceneChapter);
  const level = useQualityStore((s) => s.level);
  const keepAlive = useQualityStore((s) => s.settings.keepAlive);
  const scenes = getEffectiveScenes(level);

  const ids = useMemo(() => {
    const unique = new Set<SetId>();
    for (let i = sceneChapter - keepAlive; i <= sceneChapter + 1 + keepAlive; i++) {
      const scene = scenes[i];
      if (scene) unique.add(scene.set);
    }
    return [...unique];
  }, [sceneChapter, keepAlive, scenes]);

  // Fetch code for the chapter after next in the background.
  useEffect(() => {
    const ahead = scenes[sceneChapter + 2];
    if (ahead) preloadSet(ahead.set);
  }, [sceneChapter, scenes]);

  return (
    <>
      {ids.map((id) => (
        <SetSlot key={id} id={id} />
      ))}
    </>
  );
}

function SetSlot({ id }: { id: SetId }) {
  const group = useRef<Group>(null);
  const SetComponent = SET_COMPONENTS[id];

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const scenes = getEffectiveScenes(useQualityStore.getState().level);
    g.visible = scenes[runtime.chapter]?.set === id;
  }, -1);

  if (!SetComponent) return null;
  return (
    <group ref={group} visible={false}>
      <Suspense fallback={null}>
        <SetComponent setId={id} />
      </Suspense>
    </group>
  );
}

/**
 * Rendered by a set once its resources exist: compiles the set's shaders in
 * the background (KHR_parallel_shader_compile where available) so the first
 * frame it appears in does not hitch. Reports readiness of the opening set.
 */
export function SetWarmUp({ target, setId }: { target: RefObject<Object3D | null>; setId: SetId }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const object = target.current;
    if (!object) return;
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      if (setId === getEffectiveScenes(useQualityStore.getState().level)[0]?.set) {
        useJourneyStore.getState().setLoadStep('models', 1);
      }
    };
    // The set's root is visible even while its slot is hidden, so traversal reaches it.
    gl.compileAsync(object, camera, scene).then(finish, finish);
    return () => {
      cancelled = true;
    };
  }, [gl, camera, scene, target, setId]);

  return null;
}
