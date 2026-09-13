'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BackSide, type Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { getNoiseTexture } from '@/3d/core/noiseTexture';
import { globalUniforms } from '@/3d/core/uniforms';
import { GLSL_HASH, GLSL_NOISE_TEXTURE } from '@/shaders/chunks';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Pin the dome to the far plane regardless of camera near/far.
  gl_Position = vec4(clip.xy, clip.w * 0.99999, clip.w);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uSunDiscSize;
uniform float uStars;
uniform float uClouds;
uniform vec3 uCloudColor;
uniform float uTime;
uniform vec2 uWindDirection;
varying vec3 vDir;

${GLSL_HASH}
${GLSL_NOISE_TEXTURE}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float up = clamp(h, 0.0, 1.0);

  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(up, 0.42));
  vec3 below = mix(uSkyHorizon, uGroundColor, pow(clamp(-h, 0.0, 1.0), 0.3));
  vec3 col = h > 0.0 ? sky : below;
  col = mix(col, uFogColor, exp(-abs(h) * 9.0) * 0.5);

  float mu = dot(dir, uSunDirection);
  float sunUp = smoothstep(-0.14, 0.03, uSunDirection.y);
  float strength = min(uSunIntensity, 3.5);

  float glow = pow(max(mu, 0.0), 6.0) * 0.28 + pow(max(mu, 0.0), 48.0) * 0.55;
  col += uSunColor * glow * sunUp * strength * 0.35;
  col += uSunColor * exp(-abs(h) * 6.0) * pow(max(mu, 0.0), 2.0) * 0.16 * sunUp * strength * 0.4;

  float edge = 0.99975 - 0.00022 * uSunDiscSize;
  float disc = smoothstep(edge, edge + 0.00012, mu) * smoothstep(-0.03, 0.01, h);
  col += uSunColor * disc * 22.0 * sunUp * clamp(uSunIntensity / 2.0, 0.06, 1.0);

  if (uStars > 0.001 && h > -0.05) {
    vec3 p = dir * 300.0;
    vec3 cell = floor(p);
    float rnd = hash13(cell);
    float star = step(0.9962, rnd) * smoothstep(0.24, 0.0, length(fract(p) - 0.5));
    float twinkle = 0.6 + 0.4 * sin(uTime * (0.8 + rnd * 3.0) + rnd * 70.0);
    col += vec3(star * twinkle * 2.6) * uStars * smoothstep(-0.05, 0.22, h);
    float band = exp(-pow(dot(dir, normalize(vec3(0.35, 0.55, -0.76))), 2.0) * 16.0);
    col += vec3(0.06, 0.07, 0.1) * band * noiseFbm3(dir.xz * 7.0 + 3.0) * uStars;
  }

  if (uClouds > 0.001 && h > 0.0) {
    vec2 cuv = dir.xz / (h + 0.12);
    cuv = cuv * 0.85 + uWindDirection * uTime * 0.006;
    float n = noiseFbm(cuv * 1.7);
    float cover = smoothstep(1.02 - uClouds, 1.02 - uClouds + 0.32, n);
    float lit = pow(max(mu, 0.0), 3.0);
    vec3 cloud = uCloudColor * (0.55 + 0.45 * up) + uSunColor * lit * 0.35 * sunUp;
    col = mix(col, cloud, cover * smoothstep(0.0, 0.18, h) * 0.9);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function Sky() {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => new SphereGeometry(1, 48, 24), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uSkyZenith: globalUniforms.uSkyZenith,
          uSkyHorizon: globalUniforms.uSkyHorizon,
          uGroundColor: globalUniforms.uGroundColor,
          uFogColor: globalUniforms.uFogColor,
          uSunDirection: globalUniforms.uSunDirection,
          uSunColor: globalUniforms.uSunColor,
          uSunIntensity: globalUniforms.uSunIntensity,
          uSunDiscSize: globalUniforms.uSunDiscSize,
          uStars: globalUniforms.uStars,
          uClouds: globalUniforms.uClouds,
          uCloudColor: globalUniforms.uCloudColor,
          uTime: globalUniforms.uTime,
          uWindDirection: globalUniforms.uWindDirection,
          uNoiseTexture: { value: getNoiseTexture() },
        },
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ camera }) => {
    mesh.current?.position.copy(camera.position);
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={-1000} />;
}
