import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** Milliseconds; defaults depend on tone. `0` keeps the toast until dismissed. */
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  /** Latest screen-reader announcements, polite and assertive. */
  polite: string;
  assertive: string;
  push: (toast: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
  announce: (message: string, politeness?: 'polite' | 'assertive') => void;
}

let counter = 0;

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  polite: '',
  assertive: '',
  push: (toast) => {
    counter += 1;
    const id = `toast-${counter}`;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  announce: (message, politeness = 'polite') => {
    // Clear first so repeating the same message is announced again.
    set({ [politeness]: '' } as Pick<ToastStore, 'polite'>);
    setTimeout(() => set({ [politeness]: message } as Pick<ToastStore, 'polite'>), 50);
  },
}));

/** Transient feedback. Critical states (SOS, safety) are never communicated by toast alone. */
export const toast = {
  show: (item: Omit<ToastItem, 'id'>) => useToastStore.getState().push(item),
  success: (title: string, description?: string) => useToastStore.getState().push({ tone: 'success', title, description }),
  info: (title: string, description?: string) => useToastStore.getState().push({ tone: 'info', title, description }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ tone: 'warning', title, description }),
  error: (title: string, description?: string, action?: ToastItem['action']) =>
    useToastStore.getState().push({ tone: 'danger', title, description, action }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};

export const announce = (message: string, politeness: 'polite' | 'assertive' = 'polite') =>
  useToastStore.getState().announce(message, politeness);
