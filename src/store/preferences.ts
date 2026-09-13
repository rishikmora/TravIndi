import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { QualityLevel } from '@/3d/core/quality';

export type MotionPreference = 'system' | 'reduced' | 'full';
export type QualityPreference = 'auto' | QualityLevel;
export type TextSizePreference = 'default' | 'large';

interface PreferencesState {
  sound: boolean;
  motion: MotionPreference;
  quality: QualityPreference;
  highContrast: boolean;
  textSize: TextSizePreference;
  /** Larger text and targets, calmer motion, simpler navigation. */
  seniorMode: boolean;
  setSound: (sound: boolean) => void;
  setMotion: (motion: MotionPreference) => void;
  setQuality: (quality: QualityPreference) => void;
  setHighContrast: (highContrast: boolean) => void;
  setTextSize: (textSize: TextSizePreference) => void;
  setSeniorMode: (seniorMode: boolean) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      sound: false,
      motion: 'system',
      quality: 'auto',
      highContrast: false,
      textSize: 'default',
      seniorMode: false,
      setSound: (sound) => set({ sound }),
      setMotion: (motion) => set({ motion }),
      setQuality: (quality) => set({ quality }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setTextSize: (textSize) => set({ textSize }),
      setSeniorMode: (seniorMode) => set({ seniorMode }),
    }),
    {
      name: 'travindi:preferences',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Sound always starts muted on a new visit; everything else persists.
      partialize: ({ motion, quality, highContrast, textSize, seniorMode }) => ({ motion, quality, highContrast, textSize, seniorMode }),
    },
  ),
);
