import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { refreshScheduleCache, removeAssignmentFromCache } from '@/lib/schedule-cache';
import { useToast } from '@/hooks/use-toast';
import {
  useUndoRedoStore,
  UndoableAction,
  AssignmentPayload,
  DeleteAssignmentPayload,
  UpdateAssignmentPayload,
  CreateAssignmentPayload,
} from '@/stores/undo-redo-store';

interface Assignment {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  requestId?: string | null;
  projectType: { id: string };
  members: Array<{ member: { id: string } }>;
  formatters?: Array<{ formatter: { id: string } }>;
  projectRoles?: Array<{ projectRole: { id: string } }>;
}

export function useScheduleUndoRedo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { pushUndo, popUndo, undoStack } = useUndoRedoStore();

  const assignmentToPayload = useCallback(
    (assignment: Assignment): AssignmentPayload => ({
      title: assignment.title,
      description: assignment.description || undefined,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      projectTypeId: assignment.projectType.id,
      memberIds: assignment.members.map((m) => m.member.id),
      requestId: assignment.requestId || undefined,
      formatterIds: assignment.formatters?.map((f) => f.formatter.id),
      projectRoleIds: assignment.projectRoles?.map((pr) => pr.projectRole.id),
    }),
    []
  );

  const recordDeletion = useCallback(
    (assignment: Assignment) => {
      const action: UndoableAction = {
        type: 'DELETE_ASSIGNMENT',
        payload: assignmentToPayload(assignment),
        timestamp: Date.now(),
      };
      pushUndo(action);
    },
    [assignmentToPayload, pushUndo]
  );

  const recordUpdate = useCallback(
    (assignment: Assignment) => {
      const action: UndoableAction = {
        type: 'UPDATE_ASSIGNMENT',
        payload: {
          assignmentId: assignment.id,
          previousState: assignmentToPayload(assignment),
        } as UpdateAssignmentPayload,
        timestamp: Date.now(),
      };
      pushUndo(action);
    },
    [assignmentToPayload, pushUndo]
  );

  const recordCreation = useCallback(
    (assignmentId: string) => {
      const action: UndoableAction = {
        type: 'CREATE_ASSIGNMENT',
        payload: { assignmentId } as CreateAssignmentPayload,
        timestamp: Date.now(),
      };
      pushUndo(action);
    },
    [pushUndo]
  );

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'] });
    queryClient.invalidateQueries({ queryKey: ['request'] });
  }, [queryClient]);

  const undoDelete = useCallback(
    async (action: UndoableAction): Promise<boolean> => {
      const payload = action.payload as DeleteAssignmentPayload;
      try {
        await api.post('/assignments', payload);
        refreshScheduleCache(queryClient, [{ startDate: payload.startDate, endDate: payload.endDate }], payload.memberIds);
        invalidateQueries();
        toast({ title: 'Assignment restored', description: `"${payload.title}" has been restored.` });
        return true;
      } catch (error) {
        pushUndo(action);
        toast({ title: 'Failed to restore assignment', description: error instanceof Error ? error.message : 'An error occurred', variant: 'destructive' });
        return false;
      }
    },
    [queryClient, invalidateQueries, toast, pushUndo]
  );

  const undoUpdate = useCallback(
    async (action: UndoableAction): Promise<boolean> => {
      const payload = action.payload as UpdateAssignmentPayload;
      try {
        await api.put(`/assignments/${payload.assignmentId}`, {
          startDate: payload.previousState.startDate,
          endDate: payload.previousState.endDate,
          memberIds: payload.previousState.memberIds,
        });
        refreshScheduleCache(queryClient, [{ startDate: payload.previousState.startDate, endDate: payload.previousState.endDate }], payload.previousState.memberIds);
        invalidateQueries();
        toast({ title: 'Change undone', description: `"${payload.previousState.title}" has been restored to its previous state.` });
        return true;
      } catch (error) {
        pushUndo(action);
        toast({ title: 'Failed to undo change', description: error instanceof Error ? error.message : 'An error occurred', variant: 'destructive' });
        return false;
      }
    },
    [queryClient, invalidateQueries, toast, pushUndo]
  );

  const undoCreate = useCallback(
    async (action: UndoableAction): Promise<boolean> => {
      const payload = action.payload as CreateAssignmentPayload;
      try {
        await api.delete(`/assignments/${payload.assignmentId}`);
        removeAssignmentFromCache(queryClient, payload.assignmentId);
        invalidateQueries();
        toast({ title: 'Creation undone', description: 'The pasted assignment has been removed.' });
        return true;
      } catch (error) {
        pushUndo(action);
        toast({ title: 'Failed to undo creation', description: error instanceof Error ? error.message : 'An error occurred', variant: 'destructive' });
        return false;
      }
    },
    [queryClient, invalidateQueries, toast, pushUndo]
  );

  const undo = useCallback(async () => {
    const action = popUndo();
    if (!action) return false;

    switch (action.type) {
      case 'DELETE_ASSIGNMENT':
        return undoDelete(action);
      case 'UPDATE_ASSIGNMENT':
        return undoUpdate(action);
      case 'CREATE_ASSIGNMENT':
        return undoCreate(action);
      default:
        return false;
    }
  }, [popUndo, undoDelete, undoUpdate, undoCreate]);

  return {
    recordDeletion,
    recordUpdate,
    recordCreation,
    undo,
    canUndo: undoStack.length > 0,
  };
}
