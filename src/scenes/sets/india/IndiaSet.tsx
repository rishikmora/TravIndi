'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  type Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type Mesh,
  PlaneGeometry,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import { setStageFocus } from '@/3d/core/focus';
import { runtime } from '@/3d/core/runtime';
import { globalUniforms } from '@/3d/core/uniforms';
import { chapters } from '@/data/journey';
import type { SetComponentProps } from '@/scenes/registry';
import { SetWarmUp } from '@/scenes/SetManager';
import { useQualityStore } from '@/store/quality';
import { smoothstep } from '@/utils/math';
import { createRng } from '@/utils/random';
import { buildCityLights } from './cities';
import { geoToWorld, worldToMaskUv } from './geo';
import { buildIndiaMask, type IndiaMask } from './mask';
import {
  createCityLightMaterial,
  createCloudMaterial,
  createOceanMaterial,
  createStarMaterial,
  createTerrainMaterial,
  getTerrainUniforms,
} from './materials';
import { buildTerrainData, createHeightSampler, HIMALAYA, type TerrainData } from './terrain';
import { INTRO_STAR_POSITION } from './tracks';

function buildClouds(count: number, mask: IndiaMask, material: ShaderMaterial) {
  const rng = createRng(1911);
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new InstancedMesh(geometry, material, count);
  const seeds = new Float32Array(count);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);

  for (let i = 0; i < count; i++) {
    const himalayan = i < count * 0.38;
    let x = 0;
    let z = 0;
    if (himalayan) {
      // Bank clouds along the mountain arc so the camera can fly into them.
      const segment = rng.int(2, HIMALAYA.length - 3);
      const a = HIMALAYA[segment]!;
      const b = HIMALAYA[segment + 1]!;
      const t = rng.next();
      const p = geoToWorld({ lat: a[0] + (b[0] - a[0]) * t, lng: a[1] + (b[1] - a[1]) * t });
      x = p.x + rng.gaussian(0, 90);
      z = p.z + rng.gaussian(60, 90);
    } else {
      for (let attempt = 0; attempt < 8; attempt++) {
        x = rng.range(-1300, 1700);
        z = rng.range(-1500, 1500);
        const { u, v } = worldToMaskUv(x, z);
        if (mask.land(u, v) > 0.25 || rng.chance(0.25)) break;
      }
    }
    const y = himalayan ? rng.range(290, 470) : rng.range(240, 420);
    const size = rng.range(140, 460);
    position.set(x, y, z);
    rotation.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    scale.set(size, 1, size * rng.range(0.45, 1));
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(i, matrix);
    seeds[i] = rng.next();
  }
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      mesh.dispose();
    },
  };
}

interface TerrainJob {
  promise: Promise<TerrainData>;
  cancel: () => void;
}

/**
 * Shapes the relief in a Web Worker so a dense grid never blocks scrolling or
 * the loading screen. Falls back to the main thread if workers are unavailable.
 */
function requestTerrain(mask: IndiaMask, segments: number): TerrainJob {
  let worker: Worker | null = null;
  let settled = false;
  const promise = new Promise<TerrainData>((resolve, reject) => {
    const buildHere = () => {
      try {
        resolve(buildTerrainData({ land: mask.landData, width: mask.width, height: mask.height }, segments));
      } catch (error) {
        reject(error);
      }
    };
    try {
      worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      buildHere();
      return;
    }
    worker.onmessage = (event: MessageEvent<TerrainData>) => {
      settled = true;
      worker?.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      settled = true;
      worker?.terminate();
      buildHere();
    };
    const land = mask.landData.slice();
    worker.postMessage({ land, width: mask.width, height: mask.height, segments }, [land.buffer]);
  });
  return {
    promise,
    cancel: () => {
      if (!settled) worker?.terminate();
    },
  };
}

function createTerrainGeometry(data: TerrainData) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function assembleWorld(mask: IndiaMask, data: TerrainData, instances: number) {
  const heightAt = createHeightSampler(data);
  const terrain = { geometry: createTerrainGeometry(data), heightAt };
  const terrainMaterial = createTerrainMaterial(mask.texture);
  const oceanMaterial = createOceanMaterial(mask.texture);
  const cloudMaterial = createCloudMaterial();
  const lightMaterial = createCityLightMaterial();
  const starMaterial = createStarMaterial();
  const clouds = buildClouds(Math.round(56 * Math.max(0.45, instances)), mask, cloudMaterial);
  const lights = buildCityLights(mask, heightAt, Math.max(0.5, instances));
  const ocean = new PlaneGeometry(60000, 60000);
  ocean.rotateX(-Math.PI / 2);
  const starGeometry = new PlaneGeometry(1, 1);
  return {
    mask,
    terrain,
    terrainMaterial,
    oceanMaterial,
    cloudMaterial,
    lightMaterial,
    starMaterial,
    clouds,
    lights,
    ocean,
    starGeometry,
  };
}

type IndiaWorld = ReturnType<typeof assembleWorld>;

function disposeWorld(world: IndiaWorld) {
  world.mask.dispose();
  world.terrain.geometry.dispose();
  world.terrainMaterial.dispose();
  world.oceanMaterial.dispose();
  world.cloudMaterial.dispose();
  world.lightMaterial.dispose();
  world.starMaterial.dispose();
  world.clouds.dispose();
  world.lights.geometry.dispose();
  world.ocean.dispose();
  world.starGeometry.dispose();
}

/**
 * The subcontinent as one continuous relief: official outline, procedural
 * ranges and biomes, ocean, cloud banks, night lights and the intro star.
 */
export default function IndiaSet({ setId }: SetComponentProps) {
  const segments = useQualityStore((s) => s.settings.terrainSegments);
  const maskResolution = useQualityStore((s) => s.settings.terrainMask);
  const instances = useQualityStore((s) => s.settings.instances);
  const root = useRef<Group>(null);
  const star = useRef<Mesh>(null);
  const smooth = useRef({ border: 0, lights: 0 });
  const [world, setWorld] = useState<IndiaWorld | null>(null);
  // The frame loop animates the world's uniforms through a ref, never through React state.
  const worldRef = useRef<IndiaWorld | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    let built: IndiaWorld | null = null;
    const mask = buildIndiaMask(maskResolution);
    const job = requestTerrain(mask, segments);
    job.promise.then(
      (data) => {
        if (cancelled) return;
        built = assembleWorld(mask, data, instances);
        worldRef.current = built;
        setWorld(built);
      },
      (error: unknown) => {
        if (!cancelled) setFailure(error instanceof Error ? error : new Error('Terrain build failed'));
      },
    );
    return () => {
      cancelled = true;
      job.cancel();
      if (built) disposeWorld(built);
      else mask.dispose();
      if (worldRef.current === built) worldRef.current = null;
      setWorld((current) => (current === built ? null : current));
    };
  }, [segments, maskResolution, instances]);

  useFrame(({ camera }, delta) => {
    const world = worldRef.current;
    if (!world || !root.current?.parent?.visible) return;
    setStageFocus(0, 0, 0, 1800, 4);

    const id = chapters[runtime.chapter]?.id;
    const t = runtime.chapterT;
    let border = 0.03;
    let lights = globalUniforms.uNight.value;
    if (id === 'beginning') border = 0.03 * smoothstep(0.75, 1, runtime.intro);
    if (id === 'plan') {
      border = 0.05 + 0.32 * smoothstep(0.05, 0.75, t);
      lights = Math.max(lights, smoothstep(0.05, 0.7, t));
    }
    const k = 1 - Math.exp(-3 * Math.min(delta, 0.1));
    smooth.current.border += (border - smooth.current.border) * k;
    smooth.current.lights += (lights - smooth.current.lights) * k;
    getTerrainUniforms(world.terrainMaterial).uBorderStrength.value = smooth.current.border;
    world.lightMaterial.uniforms.uLights!.value = smooth.current.lights;

    const s = star.current;
    if (s) {
      const intro = id === 'beginning' ? runtime.intro : 1;
      const envelope = smoothstep(0.02, 0.14, intro) * (1 - smoothstep(0.34, 0.6, intro));
      world.starMaterial.uniforms.uIntensity!.value = envelope * (0.7 + 0.3 * smoothstep(0.14, 0.34, intro));
      s.visible = envelope > 0.001;
      if (s.visible) {
        s.position.set(...INTRO_STAR_POSITION);
        s.quaternion.copy(camera.quaternion);
        s.scale.setScalar(camera.position.distanceTo(s.position) * 0.05);
      }
    }
  });

  // Surfaces a failed build to the stage's error boundary, which falls back gracefully.
  if (failure) throw failure;
  if (!world) return null;

  return (
    <group ref={root}>
      <mesh geometry={world.terrain.geometry} material={world.terrainMaterial} />
      <mesh geometry={world.ocean} material={world.oceanMaterial} />
      <primitive object={world.clouds.mesh} />
      <points geometry={world.lights.geometry} material={world.lightMaterial} frustumCulled={false} />
      <mesh
        ref={star}
        geometry={world.starGeometry}
        material={world.starMaterial}
        frustumCulled={false}
        renderOrder={10}
        visible={false}
      />
      <SetWarmUp target={root} setId={setId} />
    </group>
  );
}
