import { create } from "zustand";

export interface Toast {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

interface ToastState {
  toasts: Toast[];
  add: (toast: Toast) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (toast) =>
    set((state) => ({
      toasts: [toast, ...state.toasts].slice(0, 10),
    })),
  remove: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clear: () => set({ toasts: [] }),
}));
