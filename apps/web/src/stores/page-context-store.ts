import { create } from 'zustand';

export interface PageContext {
  pathname: string;
  pageTitle: string;
  pageData?: Record<string, unknown>;
}

interface PageContextState {
  context: PageContext;
  setContext: (context: Partial<PageContext>) => void;
  setPageData: (data: Record<string, unknown>) => void;
}

export const usePageContextStore = create<PageContextState>((set) => ({
  context: {
    pathname: '/',
    pageTitle: 'GhostCast',
  },

  setContext: (newContext) =>
    set((state) => ({
      context: { ...state.context, ...newContext },
    })),

  setPageData: (pageData) =>
    set((state) => ({
      context: { ...state.context, pageData },
    })),
}));
