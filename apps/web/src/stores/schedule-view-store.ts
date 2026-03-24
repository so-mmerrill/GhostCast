import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ScheduleViewState {
  /** ISO date string of the month the user was last viewing (e.g. "2026-03-01") */
  lastViewedMonth: string | null;
  /** Number of months loaded before base */
  savedMonthsBefore: number | null;
  /** Number of months loaded after base */
  savedMonthsAfter: number | null;
  /** Zoom level (default 1) */
  zoomLevel: number;
  /** Collapsed department names */
  collapsedDepartments: string[];
  /** Whether the requests panel is collapsed */
  isRequestsPanelCollapsed: boolean;
  setLastViewedMonth: (month: string) => void;
  setSavedRange: (before: number, after: number) => void;
  setZoomLevel: (level: number) => void;
  setCollapsedDepartments: (departments: string[]) => void;
  setIsRequestsPanelCollapsed: (collapsed: boolean) => void;
}

export const useScheduleViewStore = create<ScheduleViewState>()(
  persist(
    (set) => ({
      lastViewedMonth: null,
      savedMonthsBefore: null,
      savedMonthsAfter: null,
      zoomLevel: 1,
      collapsedDepartments: [],
      isRequestsPanelCollapsed: true,
      setLastViewedMonth: (month) => set({ lastViewedMonth: month }),
      setSavedRange: (before, after) =>
        set({ savedMonthsBefore: before, savedMonthsAfter: after }),
      setZoomLevel: (level) => set({ zoomLevel: level }),
      setCollapsedDepartments: (departments) =>
        set({ collapsedDepartments: departments }),
      setIsRequestsPanelCollapsed: (collapsed) =>
        set({ isRequestsPanelCollapsed: collapsed }),
    }),
    {
      name: 'ghostcast-schedule-view',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
