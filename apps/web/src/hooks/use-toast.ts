import { create } from 'zustand';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface ToastState {
  toasts: Toast[];
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const removeToast = (toasts: Toast[], id: string) =>
  toasts.filter((t) => t.id !== id);

const addToast = (toasts: Toast[], toast: Toast) => [...toasts, toast];

export const useToast = create<ToastState>((set) => {
  const dismiss = (id: string) => {
    set((state) => ({ toasts: removeToast(state.toasts, id) }));
  };

  return {
    toasts: [],
    toast: (toast) => {
      const id = Math.random().toString(36).substring(7);
      set((state) => ({ toasts: addToast(state.toasts, { ...toast, id }) }));
      setTimeout(() => dismiss(id), 5000);
    },
    dismiss,
  };
});
