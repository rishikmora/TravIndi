import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import { globalUniforms } from '@/3d/core/uniforms';
import { GLSL_ATMOSPHERE_FOG, GLSL_ATMOSPHERE_PARS } from '@/shaders/chunks';

export interface AtmosphereOptions {
  /**
   * Sways vertices in the shared wind. Displacement grows quadratically with
   * local height, so trunks stay planted while canopies move.
   */
  wind?: {
    strength: number;
    /** Local height at which sway reaches full strength. */
    height?: number;
    frequency?: number;
  };
}

export interface ShaderExtension {
  /** Distinguishes the compiled program from other variants. */
  key: string;
  patch: (shader: WebGLProgramParametersWithUniforms) => void;
}

const WIND_PARS = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform float uWindAmount;
uniform float uWindHeight;
uniform float uWindFrequency;
`;

const WIND_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 windOrigin = instanceMatrix[3].xyz;
  #else
    vec3 windOrigin = modelMatrix[3].xyz;
  #endif
  float windH = clamp(position.y / uWindHeight, 0.0, 1.6);
  float windPhase = uTime * uWindFrequency + dot(windOrigin.xz, vec2(0.21, 0.17));
  float windSway = sin(windPhase) * 0.62 + sin(windPhase * 2.37 + 1.3) * 0.26 + sin(windPhase * 5.3 + 0.4) * 0.12;
  windSway *= uWindStrength * uWindAmount;
  transformed.xz += uWindDirection * windSway * windH * windH;
}
`;

export function patchAtmosphere(shader: WebGLProgramParametersWithUniforms, options: AtmosphereOptions = {}) {
  const wind = options.wind;
  const windAmount = wind?.strength ?? 0;

  shader.uniforms.uSunDirection = globalUniforms.uSunDirection;
  shader.uniforms.uSunColor = globalUniforms.uSunColor;
  shader.uniforms.uFogHeight = globalUniforms.uFogHeight;

  let vertex = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vAtmoWorld;\n${windAmount > 0 ? WIND_PARS : ''}`)
    .replace(
      '#include <fog_vertex>',
      '#include <fog_vertex>\nvAtmoWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);',
    );

  if (windAmount > 0) {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.uniforms.uWindDirection = globalUniforms.uWindDirection;
    shader.uniforms.uWindStrength = globalUniforms.uWindStrength;
    shader.uniforms.uWindAmount = { value: windAmount };
    shader.uniforms.uWindHeight = { value: wind?.height ?? 1 };
    shader.uniforms.uWindFrequency = { value: wind?.frequency ?? 1.4 };
    vertex = vertex.replace('#include <begin_vertex>', WIND_VERTEX);
  }

  shader.vertexShader = vertex;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vAtmoWorld;\n${GLSL_ATMOSPHERE_PARS}`)
    .replace('#include <fog_fragment>', GLSL_ATMOSPHERE_FOG);
}

/**
 * Upgrades a built-in material with the engine's atmospheric fog (ground
 * hugging density + sun in-scattering) and optional wind sway, while keeping
 * physically based lighting, shadows and instancing intact.
 */
export function applyAtmosphere<T extends Material>(
  material: T,
  options: AtmosphereOptions = {},
  extension?: ShaderExtension,
): T {
  material.onBeforeCompile = (shader) => {
    patchAtmosphere(shader, options);
    extension?.patch(shader);
  };
  const key = `atmosphere${options.wind?.strength ? '-wind' : ''}${extension ? `-${extension.key}` : ''}`;
  material.customProgramCacheKey = () => key;
  return material;
}
