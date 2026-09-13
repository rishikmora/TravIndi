/**
 * Reusable GLSL snippets. Simplex noise is based on "webgl-noise" by
 * Ian McEwan & Stefan Gustavson (MIT licence).
 */

export const GLSL_HASH = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
`;

export const GLSL_VALUE_NOISE = /* glsl */ `
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = r * p * 2.03; a *= 0.5; }
  return v;
}
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = r * p * 2.03; a *= 0.5; }
  return v;
}
`;

/**
 * Texture-backed noise (see 3d/core/noiseTexture.ts). Drop-in replacements for
 * `fbm`, `fbm3` and `vnoise` at the same input scale, costing one texture fetch.
 */
export const GLSL_NOISE_TEXTURE = /* glsl */ `
uniform sampler2D uNoiseTexture;
float noiseFbm(vec2 p) { return texture2D(uNoiseTexture, p * 0.03125).r; }
float noiseFbm3(vec2 p) { return texture2D(uNoiseTexture, p * 0.03125).g; }
float noiseValue(vec2 p) { return texture2D(uNoiseTexture, p * 0.03125).b; }
`;

export const GLSL_SIMPLEX_2D = /* glsl */ `
vec3 sn_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 sn_mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 sn_permute(vec3 x) { return sn_mod289(((x * 34.0) + 10.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = sn_mod289(i);
  vec3 p = sn_permute(sn_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

export const GLSL_SIMPLEX_3D = /* glsl */ `
vec3 sn3_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sn3_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 sn3_permute(vec4 x) { return sn3_mod289(((x * 34.0) + 10.0) * x); }
vec4 sn3_taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise3(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = sn3_mod289(i);
  vec4 p = sn3_permute(sn3_permute(sn3_permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = sn3_taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/**
 * Stand-alone version of the atmosphere for custom ShaderMaterials (sky-lit
 * water, clouds, particles). Mirrors the fog applied to built-in materials.
 */
export const GLSL_ATMOSPHERE_FUNCTION = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
vec3 applyAtmosphere(vec3 color, vec3 worldPos) {
  vec3 ray = worldPos - cameraPosition;
  float dist = length(ray);
  vec3 dir = ray / max(dist, 1e-4);
  float ground = uFogHeight > 0.0 ? mix(0.35, 1.8, exp(-max(worldPos.y, 0.0) * uFogHeight)) : 1.0;
  float density = uFogDensity * ground;
  float factor = 1.0 - exp(-density * density * dist * dist);
  float sun = pow(max(dot(dir, uSunDirection), 0.0), 6.0);
  vec3 fogCol = mix(uFogColor, uSunColor, sun * 0.35);
  return mix(color, fogCol, clamp(factor, 0.0, 1.0));
}
float atmosphereFactor(vec3 worldPos) {
  float dist = length(worldPos - cameraPosition);
  float ground = uFogHeight > 0.0 ? mix(0.35, 1.8, exp(-max(worldPos.y, 0.0) * uFogHeight)) : 1.0;
  float density = uFogDensity * ground;
  return clamp(1.0 - exp(-density * density * dist * dist), 0.0, 1.0);
}
`;

/** Declarations for the atmospheric fog used by every lit surface. */
export const GLSL_ATMOSPHERE_PARS = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uFogHeight;
`;

/**
 * Exponential-squared fog with optional ground-hugging density and sun
 * in-scattering. Expects `vAtmoWorld` (world position) and three's fog uniforms.
 */
export const GLSL_ATMOSPHERE_FOG = /* glsl */ `
#ifdef USE_FOG
  vec3 atmoRay = vAtmoWorld - cameraPosition;
  float atmoDist = length(atmoRay);
  vec3 atmoDir = atmoRay / max(atmoDist, 1e-4);
  float atmoGround = uFogHeight > 0.0 ? mix(0.35, 1.8, exp(-max(vAtmoWorld.y, 0.0) * uFogHeight)) : 1.0;
  float atmoDensity = fogDensity * atmoGround;
  float atmoFactor = 1.0 - exp(-atmoDensity * atmoDensity * atmoDist * atmoDist);
  float atmoSun = pow(max(dot(atmoDir, uSunDirection), 0.0), 6.0);
  vec3 atmoColor = mix(fogColor, uSunColor, atmoSun * 0.35);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, atmoColor, clamp(atmoFactor, 0.0, 1.0));
#endif
`;
