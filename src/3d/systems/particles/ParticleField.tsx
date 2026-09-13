'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { globalUniforms } from '@/3d/core/uniforms';
import type { ParticlePresetId } from '@/scenes/types';
import { createRng, hashString } from '@/utils/random';
import { PARTICLE_PRESETS, PARTICLE_SHAPE_CODES } from './presets';

const vertexShader = /* glsl */ `
attribute vec3 aSeed;
attribute float aRand;
uniform float uTime;
uniform vec3 uArea;
uniform vec3 uOffset;
uniform vec3 uVelocity;
uniform float uTurbulence;
uniform vec2 uSize;
uniform vec2 uResolution;
uniform float uOpacity;
uniform float uTwinkle;
varying float vAlpha;
varying float vRand;
varying float vRotation;

void main() {
  vec3 p = aSeed * uArea + uVelocity * uTime * (0.7 + 0.6 * aRand);
  p.x += sin(uTime * (0.35 + aRand * 0.8) + aRand * 31.0) * uTurbulence;
  p.z += cos(uTime * (0.3 + aRand * 0.6) + aRand * 17.0) * uTurbulence;
  p.y += sin(uTime * (0.45 + aRand * 0.5) + aRand * 9.0) * uTurbulence * 0.35;

  // Wrap the volume around the camera so weather is infinite.
  vec3 centre = cameraPosition + uOffset;
  vec3 local = mod(p - centre + uArea * 0.5, uArea) - uArea * 0.5;
  vec4 mv = viewMatrix * vec4(centre + local, 1.0);

  float size = mix(uSize.x, uSize.y, fract(aRand * 7.13));
  gl_PointSize = min(size * uResolution.y * 0.5 * projectionMatrix[1][1] / max(-mv.z, 0.01), 384.0);
  gl_Position = projectionMatrix * mv;

  vec3 edge = abs(local) / (uArea * 0.5);
  float edgeFade = 1.0 - smoothstep(0.72, 1.0, max(edge.x, max(edge.y, edge.z)));
  float nearFade = smoothstep(0.15, 1.4, -mv.z);
  float twinkle = mix(1.0, 0.45 + 0.55 * sin(uTime * (1.6 + aRand * 4.0) + aRand * 50.0), uTwinkle);
  vAlpha = uOpacity * edgeFade * nearFade * max(twinkle, 0.0);
  vRand = aRand;
  vRotation = uTime * (aRand - 0.5) * 2.4 + aRand * 6.2831;
}
`;

const fragmentShader = /* glsl */ `
uniform int uShape;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uLit;
uniform vec3 uSunColor;
uniform vec3 uHemiSky;
uniform float uHemiIntensity;
uniform float uSunIntensity;
varying float vAlpha;
varying float vRand;
varying float vRotation;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float a;
  if (uShape == 1) {
    a = smoothstep(0.07, 0.0, abs(uv.x)) * smoothstep(0.5, 0.15, abs(uv.y));
  } else if (uShape == 2) {
    a = smoothstep(0.5, 0.12, length(uv));
  } else if (uShape == 3) {
    float c = cos(vRotation);
    float s = sin(vRotation);
    vec2 r = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    r.x *= 2.4;
    a = smoothstep(0.44, 0.3, length(r));
  } else if (uShape == 4) {
    float d = length(uv);
    a = exp(-d * d * 42.0) + exp(-d * d * 9.0) * 0.35;
  } else {
    a = smoothstep(0.5, 0.0, length(uv));
    a *= a;
  }
  a *= vAlpha;
  if (a < 0.004) discard;
  vec3 color = mix(uColorA, uColorB, fract(vRand * 13.37));
  vec3 light = uSunColor * min(uSunIntensity, 3.0) * 0.3 + uHemiSky * uHemiIntensity * 0.6;
  color *= mix(vec3(1.0), light, uLit);
  gl_FragColor = vec4(color, a);
}
`;

interface ParticleFieldProps {
  preset: ParticlePresetId;
  /** Multiplies the preset's particle count (quality × layer intensity). */
  density: number;
  /** Reads the current layer opacity (0–1) each frame. */
  getOpacity: () => number;
}

export function ParticleField({ preset, density, getOpacity }: ParticleFieldProps) {
  const spec = PARTICLE_PRESETS[preset];
  const count = Math.max(8, Math.round(spec.count * density));

  const points = useMemo(() => {
    const rng = createRng(hashString(preset) ^ count);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const rands = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seeds[i * 3] = rng.next();
      seeds[i * 3 + 1] = rng.next();
      seeds[i * 3 + 2] = rng.next();
      rands[i] = rng.next();
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 3));
    geometry.setAttribute('aRand', new Float32BufferAttribute(rands, 1));

    const material = new ShaderMaterial({
      uniforms: {
        uTime: globalUniforms.uTime,
        uResolution: globalUniforms.uResolution,
        uSunColor: globalUniforms.uSunColor,
        uSunIntensity: globalUniforms.uSunIntensity,
        uHemiSky: globalUniforms.uHemiSky,
        uHemiIntensity: globalUniforms.uHemiIntensity,
        uArea: { value: new Vector3(...spec.area) },
        uOffset: { value: new Vector3(...(spec.offset ?? [0, 0, 0])) },
        uVelocity: { value: new Vector3(...spec.velocity) },
        uTurbulence: { value: spec.turbulence },
        uSize: { value: [spec.size[0], spec.size[1]] },
        uOpacity: { value: 0 },
        uTwinkle: { value: spec.twinkle ?? 0 },
        uShape: { value: PARTICLE_SHAPE_CODES[spec.shape] },
        uColorA: { value: new Color(spec.colors[0]) },
        uColorB: { value: new Color(spec.colors[1]) },
        uLit: { value: spec.lit ?? 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: spec.additive ? AdditiveBlending : NormalBlending,
    });

    const object = new Points(geometry, material);
    object.frustumCulled = false;
    object.renderOrder = 20;
    return object;
  }, [preset, count, spec]);

  useEffect(
    () => () => {
      points.geometry.dispose();
      (points.material as ShaderMaterial).dispose();
    },
    [points],
  );

  const objectRef = useRef<Points>(null);

  useFrame(() => {
    const object = objectRef.current;
    if (!object) return;
    const opacity = getOpacity();
    (object.material as ShaderMaterial).uniforms.uOpacity!.value = spec.opacity * opacity;
    object.visible = opacity > 0.002;
  });

  return <primitive ref={objectRef} object={points} />;
}
