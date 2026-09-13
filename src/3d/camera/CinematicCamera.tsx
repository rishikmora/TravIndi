'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { type PerspectiveCamera, Vector3 } from 'three';
import { runtime } from '@/3d/core/runtime';
import { getEffectiveScenes, introTrack } from '@/scenes/timeline';
import { useQualityStore } from '@/store/quality';
import { smoothstep } from '@/utils/math';
import { createCameraSample, sampleTrack } from './track';

const DEG = Math.PI / 180;
const DESIGN_ASPECT = 16 / 9;
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Scroll-driven camera. Samples the active chapter's spline, layers pointer
 * parallax, idle drift and optional handheld shake, then eases the physical
 * camera towards that pose. Chapter changes (hidden by transitions) cut.
 */
export function CinematicCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);

  const sample = useMemo(createCameraSample, []);
  const introSample = useMemo(createCameraSample, []);
  const state = useMemo(
    () => ({ position: new Vector3(), target: new Vector3(), fov: 40, roll: 0, chapter: -1, lite: false }),
    [],
  );
  const axes = useMemo(() => ({ forward: new Vector3(), right: new Vector3(), up: new Vector3() }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const chapter = runtime.chapter;
    const scene = getEffectiveScenes(useQualityStore.getState().level)[chapter];
    if (!scene) return;
    const track = scene.camera;

    sampleTrack(track, runtime.chapterT, sample);
    if (chapter === 0 && runtime.intro < 1) {
      sampleTrack(introTrack, runtime.intro, introSample);
      const w = smoothstep(0.97, 1, runtime.intro);
      sample.position.lerpVectors(introSample.position, sample.position, w);
      sample.target.lerpVectors(introSample.target, sample.target, w);
      sample.fov = introSample.fov + (sample.fov - introSample.fov) * w;
      sample.roll = introSample.roll + (sample.roll - introSample.roll) * w;
    }

    const { forward, right, up } = axes;
    forward.subVectors(sample.target, sample.position).normalize();
    right.crossVectors(forward, WORLD_UP).normalize();
    up.crossVectors(right, forward);

    const t = runtime.elapsed;
    const parallax = track.parallax ?? 0;
    const drift = track.drift ?? 0;
    const offsetX = runtime.pointer.sx * parallax + Math.sin(t * 0.21) * drift;
    const offsetY = runtime.pointer.sy * parallax * 0.55 + Math.sin(t * 0.17 + 1.3) * drift * 0.5;
    sample.position.addScaledVector(right, offsetX).addScaledVector(up, offsetY);
    sample.target.addScaledVector(right, offsetX * 0.35).addScaledVector(up, offsetY * 0.35);

    if (track.shake) {
      const s = track.shake;
      sample.position.x += (Math.sin(t * 7.3) * 0.6 + Math.sin(t * 13.1 + 1.7) * 0.4) * s;
      sample.position.y += (Math.sin(t * 9.7 + 0.4) * 0.6 + Math.sin(t * 15.3) * 0.4) * s;
    }

    const cut = state.chapter !== chapter || state.lite !== scene.lite;
    if (cut) {
      state.position.copy(sample.position);
      state.target.copy(sample.target);
      state.fov = sample.fov;
      state.roll = sample.roll;
      state.chapter = chapter;
      state.lite = scene.lite;
    } else {
      const k = 1 - Math.exp(-7.5 * dt);
      state.position.lerp(sample.position, k);
      state.target.lerp(sample.target, k);
      state.fov += (sample.fov - state.fov) * k;
      state.roll += (sample.roll - state.roll) * k;
    }

    camera.position.copy(state.position);
    camera.up.copy(WORLD_UP);
    camera.lookAt(state.target);
    if (state.roll !== 0) camera.rotateZ(state.roll * DEG);

    // Preserve the designed horizontal framing on narrow screens.
    const aspect = size.width / Math.max(1, size.height);
    let fov = state.fov;
    if (aspect < DESIGN_ASPECT) {
      const horizontal = 2 * Math.atan(Math.tan((fov * DEG) / 2) * DESIGN_ASPECT);
      fov = Math.min((2 * Math.atan(Math.tan(horizontal / 2) / aspect)) / DEG, fov * 1.6, 78);
    }
    const near = track.near ?? 1;
    const far = track.far ?? 20000;
    if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== near || camera.far !== far) {
      camera.fov = fov;
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }, -2);

  return null;
}
