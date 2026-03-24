import { create } from 'zustand';

export type UndoableActionType = 'DELETE_ASSIGNMENT' | 'UPDATE_ASSIGNMENT' | 'CREATE_ASSIGNMENT';

export interface AssignmentPayload {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  projectTypeId: string;
  memberIds: string[];
  requestId?: string;
  formatterIds?: string[];
  projectRoleIds?: string[];
}

export interface DeleteAssignmentPayload extends AssignmentPayload {}

export interface UpdateAssignmentPayload {
  assignmentId: string;
  previousState: AssignmentPayload;
}

export interface CreateAssignmentPayload {
  assignmentId: string;
}

export type UndoPayload = DeleteAssignmentPayload | UpdateAssignmentPayload | CreateAssignmentPayload;

export interface UndoableAction {
  type: UndoableActionType;
  payload: UndoPayload;
  timestamp: number;
}

interface UndoRedoState {
  undoStack: UndoableAction[];
  redoStack: UndoableAction[];
  maxStackSize: number;

  pushUndo: (action: UndoableAction) => void;
  popUndo: () => UndoableAction | undefined;
  pushRedo: (action: UndoableAction) => void;
  popRedo: () => UndoableAction | undefined;
  clearRedoStack: () => void;
  clearAll: () => void;

  canUndo: () => boolean;
  canRedo: () => boolean;
}

const MAX_STACK_SIZE = 50;

export const useUndoRedoStore = create<UndoRedoState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxStackSize: MAX_STACK_SIZE,

  pushUndo: (action) =>
    set((state) => {
      const newStack = [...state.undoStack, action];
      if (newStack.length > state.maxStackSize) {
        newStack.shift();
      }
      return {
        undoStack: newStack,
        redoStack: [],
      };
    }),

  popUndo: () => {
    const state = get();
    if (state.undoStack.length === 0) return undefined;
    const action = state.undoStack.at(-1);
    set({ undoStack: state.undoStack.slice(0, -1) });
    return action;
  },

  pushRedo: (action) =>
    set((state) => ({
      redoStack: [...state.redoStack, action].slice(-state.maxStackSize),
    })),

  popRedo: () => {
    const state = get();
    if (state.redoStack.length === 0) return undefined;
    const action = state.redoStack.at(-1);
    set({ redoStack: state.redoStack.slice(0, -1) });
    return action;
  },

  clearRedoStack: () => set({ redoStack: [] }),

  clearAll: () => set({ undoStack: [], redoStack: [] }),

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,
}));
