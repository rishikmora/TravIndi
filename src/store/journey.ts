import { create } from 'zustand';

export type RenderMode = 'pending' | 'webgl' | 'static';
export type LoadPhase = 'loading' | 'welcome' | 'entered';

export interface LoadSteps {
  models: number;
  environment: number;
  stories: number;
}

interface JourneyState {
  renderMode: RenderMode;
  staticReason: string | null;
  /** Chapter whose copy is pinned on screen. */
  activeChapter: number;
  /** Chapter whose 3D set is on screen. */
  sceneChapter: number;
  /** False once the journey has scrolled out of view, so rendering can pause. */
  stageVisible: boolean;
  loadPhase: LoadPhase;
  loadSteps: LoadSteps;
  firstFrame: boolean;
  introPlaying: boolean;
  setRenderMode: (mode: RenderMode, reason?: string | null) => void;
  setIntroPlaying: (playing: boolean) => void;
  setActiveChapter: (index: number) => void;
  setSceneChapter: (index: number) => void;
  setStageVisible: (visible: boolean) => void;
  setLoadPhase: (phase: LoadPhase) => void;
  setLoadStep: (step: keyof LoadSteps, value: number) => void;
  setFirstFrame: () => void;
}

export const useJourneyStore = create<JourneyState>()((set) => ({
  renderMode: 'pending',
  staticReason: null,
  activeChapter: 0,
  sceneChapter: 0,
  stageVisible: true,
  loadPhase: 'loading',
  loadSteps: { models: 0, environment: 0, stories: 0 },
  firstFrame: false,
  introPlaying: false,
  setRenderMode: (renderMode, reason = null) => set({ renderMode, staticReason: reason }),
  setIntroPlaying: (introPlaying) => set((s) => (s.introPlaying === introPlaying ? s : { introPlaying })),
  setActiveChapter: (activeChapter) => set((s) => (s.activeChapter === activeChapter ? s : { activeChapter })),
  setSceneChapter: (sceneChapter) => set((s) => (s.sceneChapter === sceneChapter ? s : { sceneChapter })),
  setStageVisible: (stageVisible) => set((s) => (s.stageVisible === stageVisible ? s : { stageVisible })),
  setLoadPhase: (loadPhase) => set({ loadPhase }),
  setLoadStep: (step, value) =>
    set((s) =>
      s.loadSteps[step] >= value ? s : { loadSteps: { ...s.loadSteps, [step]: Math.min(1, value) } },
    ),
  setFirstFrame: () => set((s) => (s.firstFrame ? s : { firstFrame: true })),
}));
