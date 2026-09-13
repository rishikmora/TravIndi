import { create } from 'zustand';
import {
  QUALITY_PRESETS,
  stepQuality,
  type DeviceProfile,
  type QualityLevel,
  type QualitySettings,
} from '@/3d/core/quality';

export type QualitySource = 'detected' | 'user' | 'adaptive' | 'fallback';

interface QualityState {
  level: QualityLevel;
  settings: QualitySettings;
  source: QualitySource;
  profile: DeviceProfile | null;
  /** Adaptive changes are frozen after the monitor flip-flops too often. */
  locked: boolean;
  fps: number;
  setProfile: (profile: DeviceProfile, recommended: QualityLevel) => void;
  setLevel: (level: QualityLevel, source: QualitySource) => void;
  adapt: (direction: -1 | 1) => void;
  lock: () => void;
  setFps: (fps: number) => void;
}

export const useQualityStore = create<QualityState>()((set, get) => ({
  level: 'medium',
  settings: QUALITY_PRESETS.medium,
  source: 'detected',
  profile: null,
  locked: false,
  fps: 60,
  setProfile: (profile, recommended) =>
    set({ profile, level: recommended, settings: QUALITY_PRESETS[recommended], source: 'detected' }),
  setLevel: (level, source) => set({ level, settings: QUALITY_PRESETS[level], source }),
  adapt: (direction) => {
    const { level, source, locked } = get();
    if (locked || source === 'user') return;
    const next = stepQuality(level, direction);
    if (next !== level) set({ level: next, settings: QUALITY_PRESETS[next], source: 'adaptive' });
  },
  lock: () => set({ locked: true }),
  setFps: (fps) => set({ fps }),
}));
