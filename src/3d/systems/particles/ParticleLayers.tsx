'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { runtime } from '@/3d/core/runtime';
import { journeyScenes } from '@/scenes/timeline';
import type { ParticleLayerSpec } from '@/scenes/types';
import { useJourneyStore } from '@/store/journey';
import { useQualityStore } from '@/store/quality';
import { smoothstep } from '@/utils/math';
import { ParticleField } from './ParticleField';

interface MountedLayer {
  key: string;
  chapter: number;
  spec: ParticleLayerSpec;
}

/**
 * Mounts the weather and atmosphere layers of the chapters around the current
 * one and crossfades them as the journey moves between chapters.
 */
export function ParticleLayers() {
  const sceneChapter = useJourneyStore((s) => s.sceneChapter);
  const quality = useQualityStore((s) => s.settings.particles);

  const layers = useMemo<MountedLayer[]>(() => {
    const out: MountedLayer[] = [];
    for (let chapter = sceneChapter - 1; chapter <= sceneChapter + 1; chapter++) {
      journeyScenes[chapter]?.particles?.forEach((spec, i) => {
        out.push({ key: `${chapter}-${spec.preset}-${i}`, chapter, spec });
      });
    }
    return out;
  }, [sceneChapter]);

  return (
    <>
      {layers.map((layer) => (
        <Layer key={layer.key} layer={layer} quality={quality} />
      ))}
    </>
  );
}

function Layer({ layer, quality }: { layer: MountedLayer; quality: number }) {
  const opacity = useRef(0);
  const { spec, chapter } = layer;

  useFrame((_, delta) => {
    let target = 0;
    if (runtime.chapter === chapter) {
      const t = runtime.chapterT;
      const from = spec.from ?? 0;
      const to = spec.to ?? 1;
      target = smoothstep(from - 0.001, from + 0.06, t) * (1 - smoothstep(to - 0.06, to + 0.001, t));
      if (from <= 0) target = 1 - smoothstep(to - 0.06, to + 0.001, t);
    }
    const k = 1 - Math.exp(-2.5 * Math.min(delta, 0.1));
    opacity.current += (target - opacity.current) * k;
  });

  return (
    <ParticleField
      preset={spec.preset}
      density={quality * (spec.intensity ?? 1)}
      getOpacity={() => opacity.current * Math.min(1, spec.intensity ?? 1)}
    />
  );
}
