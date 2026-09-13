'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type DirectionalLight, FogExp2, type HemisphereLight, Object3D } from 'three';
import { stageFocus } from '@/3d/core/focus';
import { runtime } from '@/3d/core/runtime';
import { globalUniforms, postState } from '@/3d/core/uniforms';
import { DEFAULT_TRANSITION_COLORS, TRANSITION_CODES } from '@/3d/post/transitions';
import { getEffectiveScenes, introEnvironment, journeyScenes } from '@/scenes/timeline';
import { useQualityStore } from '@/store/quality';
import { clamp, smoothstep } from '@/utils/math';
import {
  createResolvedEnvironment,
  evaluateKeys,
  lerpEnvironment,
  type ResolvedEnvironment,
  resolveKeys,
} from './evaluate';

const DEG = Math.PI / 180;

/**
 * Presets for detailed sets are authored at human scale. When a chapter is
 * shown as a flyover of the (much larger) India relief, its atmosphere is
 * thinned so the mood carries over without fogging out the map.
 */
const MAP_FOG_SCALE = 0.04;
const MAP_FOG_MAX = 0.00022;

function scaleForMap(env: ResolvedEnvironment) {
  env.fogDensity = Math.min(env.fogDensity * MAP_FOG_SCALE, MAP_FOG_MAX);
  env.fogHeight = 0;
}

/**
 * Evaluates the timeline's lighting for the current scroll position and pushes
 * it into fog, lights, shared shader uniforms and post-processing — the whole
 * world is re-lit from one place each frame.
 */
export function EnvironmentController() {
  const scene = useThree((s) => s.scene);
  const shadows = useQualityStore((s) => s.settings.shadows);
  const shadowMapSize = useQualityStore((s) => s.settings.shadowMapSize);
  const sunRef = useRef<DirectionalLight>(null);
  const hemiRef = useRef<HemisphereLight>(null);
  const lastRadius = useRef(-1);

  const target = useMemo(() => new Object3D(), []);
  const fog = useMemo(() => new FogExp2(0x000000, 0.001), []);
  const chapterKeys = useMemo(() => journeyScenes.map((s) => resolveKeys(s.environment)), []);
  const introKeys = useMemo(() => resolveKeys(introEnvironment), []);
  const transitionColors = useMemo(
    () =>
      journeyScenes.map((s) => ({
        color: new Color(s.transitionIn.color ?? DEFAULT_TRANSITION_COLORS[s.transitionIn.type]),
        usesFog: !s.transitionIn.color && s.transitionIn.type === 'fog',
        center: s.transitionIn.center ?? [0.5, 0.5],
      })),
    [],
  );
  const env = useMemo(createResolvedEnvironment, []);
  const neighbour = useMemo(createResolvedEnvironment, []);
  const intro = useMemo(createResolvedEnvironment, []);

  useEffect(() => {
    scene.fog = fog;
    scene.add(target);
    return () => {
      scene.fog = null;
      scene.remove(target);
    };
  }, [scene, fog, target]);

  useFrame(() => {
    const { chapter, chapterT, transition } = runtime;
    const keys = chapterKeys[chapter];
    if (!keys) return;
    const scenes = getEffectiveScenes(useQualityStore.getState().level);

    evaluateKeys(keys, chapterT, env);
    if (scenes[chapter]?.lite) scaleForMap(env);
    if (chapter === 0 && runtime.intro < 1) {
      evaluateKeys(introKeys, runtime.intro, intro);
      lerpEnvironment(intro, env, smoothstep(0.92, 1, runtime.intro), env);
    }

    // Blend half-way towards the neighbouring chapter at the boundary, so the
    // environment is continuous from either side of the cut.
    const other = transition.side < 0 ? transition.index : transition.index - 1;
    if (transition.amount > 0 && other !== chapter && other >= 0 && other < chapterKeys.length) {
      evaluateKeys(chapterKeys[other]!, transition.side < 0 ? 0 : 1, neighbour);
      if (scenes[other]?.lite) scaleForMap(neighbour);
      lerpEnvironment(env, neighbour, transition.amount * 0.5, env);
    }

    const u = globalUniforms;
    const el = env.sunElevation * DEG;
    const az = env.sunAzimuth * DEG;
    const direction = u.uSunDirection.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

    u.uSunColor.value.copy(env.sunColor);
    u.uSunIntensity.value = env.sunIntensity;
    u.uSunDiscSize.value = env.sunDiscSize;
    u.uSkyZenith.value.copy(env.skyZenith);
    u.uSkyHorizon.value.copy(env.skyHorizon);
    u.uGroundColor.value.copy(env.groundColor);
    u.uFogColor.value.copy(env.fogColor);
    u.uFogDensity.value = env.fogDensity;
    u.uFogHeight.value = env.fogHeight;
    u.uHemiSky.value.copy(env.hemiSky);
    u.uHemiGround.value.copy(env.hemiGround);
    u.uHemiIntensity.value = env.hemiIntensity;
    u.uStars.value = env.stars;
    u.uClouds.value = env.clouds;
    u.uCloudColor.value.copy(env.cloudColor);
    u.uWindStrength.value = env.wind;
    u.uWetness.value = env.wetness;
    u.uNight.value = clamp(1 - (env.sunIntensity - 0.3) / 1.2);

    fog.color.copy(env.fogColor);
    fog.density = env.fogDensity;

    const hemi = hemiRef.current;
    if (hemi) {
      hemi.color.copy(env.hemiSky);
      hemi.groundColor.copy(env.hemiGround);
      hemi.intensity = env.hemiIntensity;
    }

    const sun = sunRef.current;
    if (sun) {
      sun.color.copy(env.sunColor);
      sun.intensity = env.sunIntensity * smoothstep(-4, 2, env.sunElevation);
      sun.position.copy(stageFocus.center).addScaledVector(direction, stageFocus.radius * 2.5 + 20);
      target.position.copy(stageFocus.center);
      target.updateMatrixWorld();
      if (lastRadius.current !== stageFocus.radius) {
        const r = stageFocus.radius;
        const cam = sun.shadow.camera;
        cam.left = -r;
        cam.right = r;
        cam.top = r;
        cam.bottom = -r;
        cam.near = 0.5;
        cam.far = r * 6 + 50;
        cam.updateProjectionMatrix();
        sun.shadow.normalBias = stageFocus.normalBias;
        lastRadius.current = r;
      }
    }

    postState.exposure = env.exposure;
    postState.bloom = env.bloom;
    postState.contrast = env.contrast;
    postState.saturation = env.saturation;
    postState.vignette = env.vignette;
    postState.grain = env.grain;
    postState.warmth = env.warmth;
    postState.heatHaze = env.heatHaze;

    const spec = transitionColors[transition.index];
    postState.transitionAmount = transition.amount;
    postState.transitionType = TRANSITION_CODES[transition.type];
    if (spec) {
      postState.transitionColor.copy(spec.usesFog ? env.fogColor : spec.color);
      postState.transitionCenter.set(spec.center[0], spec.center[1]);
    }
  }, -1);

  return (
    <>
      <hemisphereLight ref={hemiRef} />
      <directionalLight
        ref={sunRef}
        target={target}
        castShadow={shadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={-0.0003}
      />
    </>
  );
}
