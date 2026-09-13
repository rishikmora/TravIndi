'use client';

import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, EffectGroup, SMAA, ToneMapping } from '@react-three/postprocessing';
import { type BloomEffect, ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import { postState } from '@/3d/core/uniforms';
import { useQualityStore } from '@/store/quality';
import { ExposureEffect, GradeEffect } from './effects';

/**
 * HDR pipeline: exposure → bloom → AgX tone mapping → SMAA → grade &
 * transitions. Expensive stages are gated by the active quality preset.
 */
export function PostStack() {
  const settings = useQualityStore((s) => s.settings);
  const exposure = useMemo(() => new ExposureEffect(), []);
  const grade = useMemo(() => new GradeEffect(), []);
  const bloom = useRef<BloomEffect>(null);

  useEffect(
    () => () => {
      exposure.dispose();
      grade.dispose();
    },
    [exposure, grade],
  );

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = postState.bloom;
  });

  return (
    <EffectComposer multisampling={settings.multisampling} enableNormalPass={false}>
      <primitive object={exposure} dispose={null} />
      {settings.bloom ? (
        <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.6} radius={0.7} />
      ) : null}
      <ToneMapping mode={ToneMappingMode.AGX} />
      {settings.smaa ? <SMAA /> : null}
      {/* UV-warping effects cannot share a pass with convolution effects. */}
      <EffectGroup>
        <primitive object={grade} dispose={null} />
      </EffectGroup>
    </EffectComposer>
  );
}
