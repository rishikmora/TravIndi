import { create } from 'zustand';

export type PanelTarget =
  | { kind: 'destination'; slug: string; attraction?: string }
  | { kind: 'state'; slug: string }
  | { kind: 'dish'; slug: string }
  | { kind: 'planner'; origin?: string };

export type CursorMode = 'default' | 'link' | 'explore' | 'text';

interface UIState {
  searchOpen: boolean;
  searchSeed: string;
  menuOpen: boolean;
  preferencesOpen: boolean;
  panel: PanelTarget | null;
  cursor: CursorMode;
  cursorLabel: string | null;
  openSearch: (seed?: string) => void;
  closeSearch: () => void;
  setMenuOpen: (open: boolean) => void;
  setPreferencesOpen: (open: boolean) => void;
  openPanel: (target: PanelTarget) => void;
  closePanel: () => void;
  setCursor: (mode: CursorMode, label?: string | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  searchOpen: false,
  searchSeed: '',
  menuOpen: false,
  preferencesOpen: false,
  panel: null,
  cursor: 'default',
  cursorLabel: null,
  openSearch: (seed = '') => set({ searchOpen: true, searchSeed: seed, menuOpen: false }),
  closeSearch: () => set({ searchOpen: false }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setPreferencesOpen: (preferencesOpen) => set({ preferencesOpen }),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
  setCursor: (cursor, cursorLabel = null) =>
    set((s) => (s.cursor === cursor && s.cursorLabel === cursorLabel ? s : { cursor, cursorLabel })),
}));
