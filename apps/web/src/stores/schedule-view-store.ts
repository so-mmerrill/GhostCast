import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ColorMode = 'project-type' | 'assignment' | 'client';
export type MemberSortBy = 'name' | 'position';
export type DepartmentSortBy = 'alpha' | 'alpha-desc' | 'member-count-desc' | 'member-count-asc';

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
  /** Color mode: 'assessment' uses ProjectType colors, 'request' uses unique per-request colors */
  colorMode: ColorMode;
  /** How to sort members within departments */
  memberSortBy: MemberSortBy;
  /** How to order departments */
  departmentSortBy: DepartmentSortBy;
  setLastViewedMonth: (month: string) => void;
  setSavedRange: (before: number, after: number) => void;
  setZoomLevel: (level: number) => void;
  setCollapsedDepartments: (departments: string[]) => void;
  setIsRequestsPanelCollapsed: (collapsed: boolean) => void;
  setColorMode: (mode: ColorMode) => void;
  setMemberSortBy: (sort: MemberSortBy) => void;
  setDepartmentSortBy: (sort: DepartmentSortBy) => void;
  initSortFromPreferences: (prefs: Record<string, unknown>) => void;
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
      colorMode: 'project-type' as ColorMode,
      memberSortBy: 'name' as MemberSortBy,
      departmentSortBy: 'alpha' as DepartmentSortBy,
      setLastViewedMonth: (month) => set({ lastViewedMonth: month }),
      setSavedRange: (before, after) =>
        set({ savedMonthsBefore: before, savedMonthsAfter: after }),
      setZoomLevel: (level) => set({ zoomLevel: level }),
      setCollapsedDepartments: (departments) =>
        set({ collapsedDepartments: departments }),
      setIsRequestsPanelCollapsed: (collapsed) =>
        set({ isRequestsPanelCollapsed: collapsed }),
      setColorMode: (mode) => set({ colorMode: mode }),
      setMemberSortBy: (sort) => set({ memberSortBy: sort }),
      setDepartmentSortBy: (sort) => set({ departmentSortBy: sort }),
      initSortFromPreferences: (prefs) => set({
        ...(prefs.scheduleMemberSortBy ? { memberSortBy: prefs.scheduleMemberSortBy as MemberSortBy } : {}),
        ...(prefs.scheduleDepartmentSortBy ? { departmentSortBy: prefs.scheduleDepartmentSortBy as DepartmentSortBy } : {}),
      }),
    }),
    {
      name: 'ghostcast-schedule-view',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
