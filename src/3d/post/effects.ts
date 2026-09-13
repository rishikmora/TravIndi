import { BlendFunction, Effect } from 'postprocessing';
import { Color, Uniform, Vector2, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { getNoiseTexture } from '@/3d/core/noiseTexture';
import { postState } from '@/3d/core/uniforms';
import { GLSL_HASH, GLSL_NOISE_TEXTURE } from '@/shaders/chunks';

const exposureShader = /* glsl */ `
uniform float uExposure;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * uExposure, inputColor.a);
}
`;

/** Scene-referred exposure, applied before bloom and tone mapping. */
export class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', exposureShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([['uExposure', new Uniform(1)]]),
    });
  }

  override update(): void {
    this.uniforms.get('uExposure')!.value = postState.exposure;
  }
}

const gradeShader = /* glsl */ `
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uWarmth;
uniform float uHeat;
uniform float uAmount;
uniform int uType;
uniform vec3 uColor;
uniform vec2 uCenter;
uniform float uTime;
uniform float uAspect;
uniform vec2 uResolution;

${GLSL_HASH}
${GLSL_NOISE_TEXTURE}

void mainUv(inout vec2 uv) {
  if (uHeat > 0.001) {
    float n = noiseValue(vec2(uv.x * 18.0, uv.y * 7.0 - uTime * 1.8));
    uv.x += (n - 0.5) * 0.004 * uHeat * smoothstep(0.7, 0.2, uv.y);
  }
  if (uType == 6 && uAmount > 0.001) {
    vec2 p = uv - uCenter;
    p.x *= uAspect;
    float d = length(p);
    float ripple = sin(d * 46.0 - uTime * 5.0) * exp(-d * 2.2);
    vec2 offset = (p / max(d, 1e-4)) * ripple * 0.012 * uAmount;
    offset.x /= uAspect;
    uv += offset;
  }
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Grade in a perceptual space; the pass output stays linear.
  vec3 c = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
  vec3 tc = pow(max(uColor, 0.0), vec3(1.0 / 2.2));

  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  vec3 highlights = uWarmth >= 0.0 ? vec3(1.035, 1.0, 0.95) : vec3(0.96, 1.0, 1.045);
  vec3 lows = uWarmth >= 0.0 ? vec3(0.97, 0.99, 1.03) : vec3(1.0, 1.0, 1.02);
  c *= mix(vec3(1.0), mix(lows, highlights, smoothstep(0.15, 0.75, l)), min(abs(uWarmth), 1.0));

  vec2 q = vUv;
  vec2 p = q - uCenter;
  p.x *= uAspect;
  float a = clamp(uAmount, 0.0, 1.0);

  if (uType == 1) {
    // Fog reveal
    float n = noiseFbm(q * vec2(uAspect, 1.0) * 2.2 + vec2(uTime * 0.03, uTime * 0.01));
    float m = smoothstep(0.0, 1.0, a * 1.5 - n * 0.55 + 0.02);
    c = mix(c, tc * (0.92 + n * 0.16), m);
  } else if (uType == 2) {
    // Light flash
    float r = length(p);
    float glow = exp(-r * r * mix(7.0, 0.5, a));
    c += tc * glow * a * 0.9;
    c = mix(c, tc, smoothstep(0.35, 1.0, a));
  } else if (uType == 3) {
    // Portal: an iris closes to dark and reopens elsewhere
    float r = length(p);
    float radius = mix(1.45, -0.2, a);
    float edge = smoothstep(radius - 0.02, radius + 0.42, r);
    c = mix(c, tc, max(edge, smoothstep(0.82, 1.0, a)));
  } else if (uType == 4) {
    // Particle dissolve with an ember rim
    float n = noiseFbm(q * vec2(uAspect, 1.0) * 5.5);
    float th = a * 1.12 - 0.04;
    float keep = smoothstep(th, th + 0.05, n);
    float rim = smoothstep(th - 0.07, th, n) * (1.0 - keep);
    c = mix(tc, c, keep) + rim * vec3(1.0, 0.72, 0.38) * 1.4 * a;
  } else if (uType == 5) {
    // Wind-blown sand
    vec2 sq = q * vec2(uAspect * 2.4, 1.0);
    sq.x += uTime * 0.35;
    float streak = noiseFbm(vec2(sq.x * 0.7, sq.y * 9.0));
    float m = smoothstep(0.0, 1.0, a * 1.7 - streak * 0.65);
    float grainS = hash12(floor(q * uResolution * 0.5) + floor(uTime * 24.0));
    c = mix(c, tc * (0.8 + streak * 0.35) + (grainS - 0.5) * 0.08, m);
  } else if (uType == 6) {
    // Water
    float n = noiseFbm(q * 3.0 + uTime * 0.04);
    c = mix(c, tc * (0.85 + n * 0.3), smoothstep(0.25, 1.0, a) * 0.95);
  } else if (uType == 7) {
    // Warm petal haze
    float n = noiseFbm(q * vec2(uAspect, 1.0) * 3.0 - vec2(0.0, uTime * 0.05));
    c = mix(c, tc * (0.9 + n * 0.2), smoothstep(0.2, 1.0, a) * (0.75 + 0.25 * n));
  } else if (uType == 8) {
    // Cloud bank
    float n = noiseFbm(q * vec2(uAspect, 1.0) * 1.7 + vec2(uTime * 0.012, -uTime * 0.02));
    float m = smoothstep(0.02, 0.9, a * 1.65 - n * 0.7);
    c = mix(c, tc * (0.88 + n * 0.22), m);
  }

  vec2 v = q - 0.5;
  v.x *= mix(1.0, uAspect, 0.55);
  float vignette = smoothstep(0.95, 0.25, length(v));
  c *= mix(1.0, vignette, uVignette);

  float g = hash12(q * uResolution + fract(uTime * 13.7) * 311.0) - 0.5;
  c += g * uGrain;

  outputColor = vec4(pow(max(c, 0.0), vec3(2.2)), inputColor.a);
}
`;

/**
 * Final colour grade plus every screen-space scene transition. Transitions
 * live here (rather than as geometry) so they can read and warp the rendered
 * frame — water ripples, heat haze, dissolves.
 */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['uContrast', new Uniform(1)],
        ['uSaturation', new Uniform(1)],
        ['uVignette', new Uniform(0.3)],
        ['uGrain', new Uniform(0.03)],
        ['uWarmth', new Uniform(0)],
        ['uHeat', new Uniform(0)],
        ['uAmount', new Uniform(0)],
        ['uType', new Uniform(0)],
        ['uColor', new Uniform(new Color())],
        ['uCenter', new Uniform(new Vector2(0.5, 0.5))],
        ['uTime', new Uniform(0)],
        ['uAspect', new Uniform(1)],
        ['uResolution', new Uniform(new Vector2(1, 1))],
        ['uNoiseTexture', new Uniform(getNoiseTexture())],
      ]),
    });
  }

  override update(_renderer: WebGLRenderer, _inputBuffer: WebGLRenderTarget, deltaTime?: number): void {
    const u = this.uniforms;
    u.get('uTime')!.value += deltaTime ?? 1 / 60;
    u.get('uContrast')!.value = postState.contrast;
    u.get('uSaturation')!.value = postState.saturation;
    u.get('uVignette')!.value = postState.vignette;
    u.get('uGrain')!.value = postState.grain;
    u.get('uWarmth')!.value = postState.warmth;
    u.get('uHeat')!.value = postState.heatHaze;
    u.get('uAmount')!.value = postState.transitionAmount;
    u.get('uType')!.value = postState.transitionType;
    (u.get('uColor')!.value as Color).copy(postState.transitionColor);
    (u.get('uCenter')!.value as Vector2).copy(postState.transitionCenter);
  }

  override setSize(width: number, height: number): void {
    this.uniforms.get('uAspect')!.value = width / Math.max(1, height);
    (this.uniforms.get('uResolution')!.value as Vector2).set(width, height);
  }
}
