import { create } from 'zustand';
import { ComponentType } from 'react';

export interface IconTrayRegistration {
  /** Unique identifier */
  id: string;
  /** Lucide icon name */
  icon: string;
  /** Tooltip text */
  tooltip: string;
  /** Panel title */
  panelTitle: string;
  /** React component to render in the panel */
  PanelComponent: ComponentType<{ onClose: () => void }>;
  /** Priority for ordering (lower = first) */
  priority: number;
  /** Optional badge count */
  badgeCount?: number;
  /** Plugin ID that registered this (for cleanup) */
  pluginId?: string;
  /** Window width in pixels */
  windowWidth: number;
  /** Window height in pixels */
  windowHeight: number;
  /** Hide the close (X) button in the header */
  hideCloseButton?: boolean;
  /** Optional component to render in the header (after the title) */
  HeaderComponent?: ComponentType;
}

interface IconTrayState {
  registrations: IconTrayRegistration[];
  activePanelId: string | null;

  // Actions
  register: (registration: IconTrayRegistration) => void;
  unregister: (id: string) => void;
  unregisterByPlugin: (pluginId: string) => void;
  openPanel: (id: string) => void;
  closePanel: () => void;
  togglePanel: (id: string) => void;
  updateBadge: (id: string, count: number | undefined) => void;
}

export const useIconTrayStore = create<IconTrayState>((set) => ({
  registrations: [],
  activePanelId: null,

  register: (registration) =>
    set((state) => ({
      registrations: [...state.registrations, registration].sort(
        (a, b) => a.priority - b.priority
      ),
    })),

  unregister: (id) =>
    set((state) => ({
      registrations: state.registrations.filter((r) => r.id !== id),
      activePanelId: state.activePanelId === id ? null : state.activePanelId,
    })),

  unregisterByPlugin: (pluginId) =>
    set((state) => ({
      registrations: state.registrations.filter((r) => r.pluginId !== pluginId),
      activePanelId:
        state.registrations.find((r) => r.id === state.activePanelId)?.pluginId === pluginId
          ? null
          : state.activePanelId,
    })),

  openPanel: (id) => set({ activePanelId: id }),

  closePanel: () => set({ activePanelId: null }),

  togglePanel: (id) =>
    set((state) => ({
      activePanelId: state.activePanelId === id ? null : id,
    })),

  updateBadge: (id, count) =>
    set((state) => ({
      registrations: state.registrations.map((r) =>
        r.id === id ? { ...r, badgeCount: count } : r
      ),
    })),
}));
