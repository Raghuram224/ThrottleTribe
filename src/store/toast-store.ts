import { create } from 'zustand';

interface Toast {
  id: number;
  text: string;
}

interface ToastState {
  toast: Toast | null;
  /** Shows `text` for `ms` (default 3 s); a newer toast replaces the current one. */
  show: (text: string, ms?: number) => void;
  hide: () => void;
}

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (text, ms = 3000) => {
    if (timer) clearTimeout(timer);
    const id = nextId++;
    set({ toast: { id, text } });
    timer = setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), ms);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ toast: null });
  },
}));

/** Imperative helper for non-React code and handlers. */
export function showToast(text: string, ms?: number): void {
  useToastStore.getState().show(text, ms);
}
