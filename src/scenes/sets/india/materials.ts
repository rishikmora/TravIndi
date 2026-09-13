import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  ShaderMaterial,
  type Texture,
  Vector2,
} from 'three';
import { getNoiseTexture } from '@/3d/core/noiseTexture';
import { globalUniforms } from '@/3d/core/uniforms';
import { applyAtmosphere } from '@/3d/materials/atmosphere';
import { GLSL_ATMOSPHERE_FUNCTION, GLSL_NOISE_TEXTURE } from '@/shaders/chunks';
import { TERRAIN_SIZE } from './geo';

const g = globalUniforms;

const atmosphereUniforms = () => ({
  uFogColor: g.uFogColor,
  uFogDensity: g.uFogDensity,
  uFogHeight: g.uFogHeight,
  uSunDirection: g.uSunDirection,
  uSunColor: g.uSunColor,
});

export interface TerrainUniforms {
  uIndiaMask: { value: Texture };
  uTerrainSize: { value: Vector2 };
  uBorderStrength: { value: number };
  uBorderColor: { value: Color };
  uNeighbourDim: { value: number };
}

/**
 * Physically lit relief with vertex-coloured biomes. Land outside India is
 * gently desaturated, and India's official outline can glow along its edge.
 */
export function createTerrainMaterial(mask: Texture) {
  const uniforms: TerrainUniforms = {
    uIndiaMask: { value: mask },
    uTerrainSize: { value: new Vector2(TERRAIN_SIZE.width, TERRAIN_SIZE.depth) },
    uBorderStrength: { value: 0 },
    uBorderColor: { value: new Color('#ffc98a') },
    uNeighbourDim: { value: 1 },
  };
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  material.userData.uniforms = uniforms;

  applyAtmosphere(
    material,
    {},
    {
      key: 'india-terrain',
      patch: (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform vec2 uTerrainSize;\nvarying vec2 vMaskUv;')
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvMaskUv = vec2((position.x + uTerrainSize.x * 0.5) / uTerrainSize.x, (position.z + uTerrainSize.y * 0.5) / uTerrainSize.y);',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nuniform sampler2D uIndiaMask;\nuniform float uBorderStrength;\nuniform vec3 uBorderColor;\nuniform float uNeighbourDim;\nvarying vec2 vMaskUv;',
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            vec3 indiaMask = texture2D(uIndiaMask, vMaskUv).rgb;
            float terrainLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 neighbourTone = mix(vec3(terrainLuma), diffuseColor.rgb, 0.5) * 0.72;
            diffuseColor.rgb = mix(diffuseColor.rgb, neighbourTone, (1.0 - indiaMask.r) * uNeighbourDim);`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float borderBand = 1.0 - smoothstep(0.0, 0.14, abs(indiaMask.g - 0.5));
            totalEmissiveRadiance += uBorderColor * borderBand * uBorderStrength;`,
          );
      },
    },
  );
  return material;
}

export function getTerrainUniforms(material: MeshStandardMaterial) {
  return material.userData.uniforms as TerrainUniforms;
}

const oceanVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const oceanFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uSunIntensity;
uniform vec3 uHemiSky;
uniform float uHemiIntensity;
uniform sampler2D uIndiaMask;
uniform vec2 uTerrainSize;
varying vec3 vWorld;

${GLSL_NOISE_TEXTURE}
${GLSL_ATMOSPHERE_FUNCTION}

vec2 waveSlope(vec2 p, float t) {
  vec2 d = vec2(0.0);
  d += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.045 + t * 0.7) * 0.5;
  d += vec2(-0.45, 0.89) * cos(dot(p, vec2(-0.45, 0.89)) * 0.11 + t * 1.1) * 0.3;
  d += vec2(0.28, -0.96) * cos(dot(p, vec2(0.28, -0.96)) * 0.23 + t * 1.6) * 0.18;
  d += (vec2(noiseValue(p * 0.012 + t * 0.03), noiseValue(p * 0.012 - t * 0.025)) - 0.5) * 0.6;
  return d;
}

void main() {
  float dist = length(cameraPosition - vWorld);
  float amplitude = 0.22 / (1.0 + dist * 0.0006);
  vec2 slope = waveSlope(vWorld.xz, uTime) * amplitude;
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 V = normalize(cameraPosition - vWorld);

  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 skyReflection = mix(uSkyHorizon, uSkyZenith, pow(clamp(R.y, 0.0, 1.0), 0.25));
  skyReflection = mix(skyReflection, uSkyZenith, 0.35);
  float sunDot = max(dot(R, uSunDirection), 0.0);
  float sunVisible = smoothstep(-0.04, 0.06, uSunDirection.y);
  float specular = (pow(sunDot, 900.0) * 40.0 + pow(sunDot, 60.0) * 0.6) * uSunIntensity * sunVisible;

  vec2 maskUv = vec2((vWorld.x + uTerrainSize.x * 0.5) / uTerrainSize.x, (vWorld.z + uTerrainSize.y * 0.5) / uTerrainSize.y);
  float inside = step(0.0, maskUv.x) * step(maskUv.x, 1.0) * step(0.0, maskUv.y) * step(maskUv.y, 1.0);
  float coast = texture2D(uIndiaMask, clamp(maskUv, 0.0, 1.0)).b * inside;

  vec3 deep = vec3(0.006, 0.035, 0.07);
  vec3 shallow = vec3(0.03, 0.17, 0.19);
  vec3 body = mix(deep, shallow, smoothstep(0.03, 0.55, coast));
  vec3 ambient = uHemiSky * uHemiIntensity * 0.6 + uSunColor * max(uSunDirection.y, 0.0) * uSunIntensity * 0.15;

  vec3 color = body * (0.55 + ambient * 1.2) + skyReflection * fresnel * 0.6 + uSunColor * specular;
  color = applyAtmosphere(color, vWorld);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export function createOceanMaterial(mask: Texture) {
  return new ShaderMaterial({
    uniforms: {
      ...atmosphereUniforms(),
      uTime: g.uTime,
      uSkyZenith: g.uSkyZenith,
      uSkyHorizon: g.uSkyHorizon,
      uSunIntensity: g.uSunIntensity,
      uHemiSky: g.uHemiSky,
      uHemiIntensity: g.uHemiIntensity,
      uIndiaMask: { value: mask },
      uTerrainSize: { value: new Vector2(TERRAIN_SIZE.width, TERRAIN_SIZE.depth) },
      uNoiseTexture: { value: getNoiseTexture() },
    },
    vertexShader: oceanVertex,
    fragmentShader: oceanFragment,
  });
}

const cloudVertex = /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const cloudFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uCloudColor;
uniform float uSunIntensity;
uniform vec3 uHemiSky;
uniform float uOpacity;
varying vec2 vUv;
varying float vSeed;
varying vec3 vWorld;

${GLSL_NOISE_TEXTURE}
${GLSL_ATMOSPHERE_FUNCTION}

void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float n = noiseFbm(vUv * 2.6 + vec2(vSeed * 13.1, vSeed * 7.3) + vec2(uTime * 0.004, 0.0));
  float n2 = noiseFbm3(vUv * 7.0 - vSeed * 3.0 + uTime * 0.01);
  float shape = n * 0.75 + n2 * 0.35 + (1.0 - r) * 0.7 - 0.62;
  float alpha = smoothstep(0.0, 0.35, shape) * smoothstep(1.0, 0.7, r);
  if (alpha < 0.01) discard;

  vec3 lit = uCloudColor * (0.72 + 0.4 * n2) + uSunColor * 0.2 * min(uSunIntensity, 3.0) * max(uSunDirection.y + 0.2, 0.0);
  vec3 color = mix(uHemiSky * 0.4, lit, 0.85);
  float cameraDistance = length(cameraPosition - vWorld);
  alpha *= smoothstep(40.0, 260.0, cameraDistance) * uOpacity;
  color = applyAtmosphere(color, vWorld);
  gl_FragColor = vec4(color, alpha * 0.9);
  #include <colorspace_fragment>
}
`;

export function createCloudMaterial() {
  return new ShaderMaterial({
    uniforms: {
      ...atmosphereUniforms(),
      uTime: g.uTime,
      uCloudColor: g.uCloudColor,
      uSunIntensity: g.uSunIntensity,
      uHemiSky: g.uHemiSky,
      uOpacity: { value: 1 },
      uNoiseTexture: { value: getNoiseTexture() },
    },
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

const lightsVertex = /* glsl */ `
attribute float aSize;
attribute float aIntensity;
attribute float aSeed;
attribute float aWarm;
uniform float uTime;
uniform float uPixelRatio;
uniform float uLights;
varying float vAlpha;
varying float vWarm;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uPixelRatio * (900.0 / -mv.z), 1.0, 48.0);
  gl_Position = projectionMatrix * mv;
  float flicker = 0.88 + 0.12 * sin(uTime * (1.3 + aSeed * 2.0) + aSeed * 90.0);
  vAlpha = aIntensity * flicker * uLights;
  vWarm = aWarm;
}
`;

const lightsFragment = /* glsl */ `
varying float vAlpha;
varying float vWarm;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float core = exp(-d * d * 7.0);
  float halo = exp(-d * d * 2.2) * 0.35;
  vec3 warm = vec3(1.0, 0.62, 0.28);
  vec3 cool = vec3(0.85, 0.9, 1.0);
  gl_FragColor = vec4(mix(cool, warm, vWarm) * (core + halo) * vAlpha * 2.2, 1.0);
}
`;

export function createCityLightMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: g.uTime, uPixelRatio: g.uPixelRatio, uLights: { value: 0 } },
    vertexShader: lightsVertex,
    fragmentShader: lightsFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

const starVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const starFragment = /* glsl */ `
uniform float uIntensity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float core = exp(-r * r * 90.0);
  float glow = exp(-r * 5.5) * 0.35;
  float spikes = exp(-abs(p.x) * 160.0) * exp(-abs(p.y) * 7.0) + exp(-abs(p.y) * 160.0) * exp(-abs(p.x) * 7.0);
  gl_FragColor = vec4(uColor * (core * 30.0 + glow + spikes * 0.6) * uIntensity, 1.0);
}
`;

/** The single point of light the journey opens on. */
export function createStarMaterial() {
  return new ShaderMaterial({
    uniforms: { uIntensity: { value: 0 }, uColor: { value: new Color('#ffe3b8') } },
    vertexShader: starVertex,
    fragmentShader: starFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}
