/**
 * Quality management: device profiling, presets and the rules that map one to
 * the other. Runtime frame-rate adaptation (resolution only) lives in
 * <QualityGovernor />.
 */

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_ORDER: readonly QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

export interface QualitySettings {
  label: string;
  dpr: [min: number, max: number];
  shadows: boolean;
  shadowMapSize: number;
  /** Multiplies particle counts of every particle layer. */
  particles: number;
  /** Multiplies instanced vegetation, crowds and props. */
  instances: number;
  birds: number;
  bloom: boolean;
  smaa: boolean;
  depthOfField: boolean;
  multisampling: number;
  reflections: 'planar' | 'analytic';
  reflectionResolution: number;
  /** Columns of the India relief grid (rows follow its aspect). Built in a worker. */
  terrainSegments: number;
  /** Resolution of the rasterised India outline that shapes coastlines and borders. */
  terrainMask: number;
  pointLights: number;
  /** How many neighbouring scene sets stay mounted around the active one. */
  keepAlive: number;
  anisotropy: number;
  /** Allow progressive upgrade to full-resolution video. */
  hdVideo: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    label: 'Low',
    dpr: [0.75, 1],
    shadows: false,
    shadowMapSize: 512,
    particles: 0.3,
    instances: 0.35,
    birds: 10,
    bloom: false,
    smaa: false,
    depthOfField: false,
    multisampling: 0,
    reflections: 'analytic',
    reflectionResolution: 256,
    terrainSegments: 256,
    terrainMask: 1024,
    pointLights: 0,
    keepAlive: 0,
    anisotropy: 1,
    hdVideo: false,
  },
  medium: {
    label: 'Medium',
    dpr: [1, 1.25],
    shadows: true,
    shadowMapSize: 1024,
    particles: 0.6,
    instances: 0.6,
    birds: 22,
    bloom: true,
    smaa: false,
    depthOfField: false,
    multisampling: 0,
    reflections: 'analytic',
    reflectionResolution: 512,
    terrainSegments: 512,
    terrainMask: 2048,
    pointLights: 2,
    keepAlive: 1,
    anisotropy: 4,
    hdVideo: false,
  },
  high: {
    label: 'High',
    dpr: [1, 1.6],
    shadows: true,
    shadowMapSize: 2048,
    particles: 1,
    instances: 1,
    birds: 36,
    bloom: true,
    smaa: true,
    depthOfField: true,
    multisampling: 0,
    reflections: 'planar',
    reflectionResolution: 768,
    terrainSegments: 768,
    terrainMask: 2048,
    pointLights: 4,
    keepAlive: 1,
    anisotropy: 8,
    hdVideo: true,
  },
  ultra: {
    label: 'Ultra',
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 4096,
    particles: 1.4,
    instances: 1.3,
    birds: 56,
    bloom: true,
    smaa: true,
    depthOfField: true,
    multisampling: 4,
    reflections: 'planar',
    reflectionResolution: 1024,
    terrainSegments: 1024,
    terrainMask: 2048,
    pointLights: 6,
    keepAlive: 2,
    anisotropy: 16,
    hdVideo: true,
  },
};

export interface DeviceProfile {
  renderer: string;
  vendor: string;
  webgl2: boolean;
  software: boolean;
  gpuTier: 0 | 1 | 2 | 3;
  cores: number;
  memoryGb: number | null;
  isMobile: boolean;
  isTouch: boolean;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  saveData: boolean;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

function classifyGpu(renderer: string): 0 | 1 | 2 | 3 {
  const r = renderer.toLowerCase();
  if (!r) return 1;
  if (SOFTWARE.test(r)) return 0;
  if (/rtx\s?(30|40|50)\d\d|rx\s?(6[89]|7[6-9]|9\d)\d\d|radeon pro w|apple m[2-9]\s?(pro|max|ultra)|arc\s?b\d/.test(r)) return 3;
  if (/rtx|gtx\s?(10|16)\d\d|radeon rx|radeon pro|apple m\d|apple gpu|arc\s?a\d|quadro|geforce/.test(r)) return 2;
  if (/iris xe|iris\(r\) xe|adreno.*(7[3-9]\d|8\d\d)|mali-g(7[6-9]|[89]\d{2})|apple a1[5-9]|radeon(tm)? graphics|radeon vega/.test(r)) return 2;
  if (/intel|uhd|hd graphics|adreno|mali|powervr|apple a\d/.test(r)) return 1;
  return 1;
}

export function profileDevice(probe: { renderer: string; vendor: string; webgl2: boolean }): DeviceProfile {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent ?? '';
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (isTouch && window.innerWidth < 900);
  const memoryGb = (nav as Navigator & { deviceMemory?: number } | undefined)?.deviceMemory ?? null;
  const connection = (nav as Navigator & { connection?: { saveData?: boolean } } | undefined)?.connection;

  return {
    renderer: probe.renderer,
    vendor: probe.vendor,
    webgl2: probe.webgl2,
    software: SOFTWARE.test(probe.renderer),
    gpuTier: classifyGpu(probe.renderer),
    cores: nav?.hardwareConcurrency ?? 4,
    memoryGb,
    isMobile,
    isTouch,
    screenWidth: typeof window !== 'undefined' ? window.screen.width : 1920,
    screenHeight: typeof window !== 'undefined' ? window.screen.height : 1080,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    saveData: Boolean(connection?.saveData),
  };
}

export function recommendQuality(profile: DeviceProfile): QualityLevel {
  if (profile.software || profile.saveData || !profile.webgl2) return 'low';

  let level: QualityLevel;
  switch (profile.gpuTier) {
    case 3:
      level = 'ultra';
      break;
    case 2:
      level = 'high';
      break;
    case 1:
      level = profile.cores >= 8 && (profile.memoryGb ?? 8) >= 8 ? 'medium' : 'low';
      break;
    default:
      level = 'low';
  }

  if (profile.memoryGb !== null && profile.memoryGb <= 4) level = minLevel(level, 'medium');
  if (profile.isMobile) level = minLevel(level, profile.gpuTier >= 2 ? 'medium' : 'low');
  // Very large, dense displays cost a lot of fill-rate.
  if (profile.screenWidth * profile.pixelRatio > 3800 && level === 'ultra') level = 'high';
  return level;
}

export function minLevel(a: QualityLevel, b: QualityLevel): QualityLevel {
  return QUALITY_ORDER.indexOf(a) <= QUALITY_ORDER.indexOf(b) ? a : b;
}

export function stepQuality(level: QualityLevel, direction: -1 | 1): QualityLevel {
  const i = QUALITY_ORDER.indexOf(level) + direction;
  return QUALITY_ORDER[Math.max(0, Math.min(QUALITY_ORDER.length - 1, i))]!;
}
