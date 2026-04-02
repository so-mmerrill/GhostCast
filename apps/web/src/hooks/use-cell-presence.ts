import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  WebSocketEvent,
  CellSelection,
  SelectionUpdatePayload,
  AssignmentSelection,
  AssignmentSelectionUpdatePayload,
} from '@ghostcast/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';

const WS_URL = import.meta.env.VITE_WS_URL || undefined;

interface UseCellPresenceOptions {
  scheduleRoomId: string;
  enabled?: boolean;
}

interface UseCellPresenceReturn {
  /** Map of other users' cell selections (userId -> CellSelection) */
  otherSelections: Map<string, CellSelection>;
  /** Map of other users' assignment selections (userId -> AssignmentSelection) */
  otherAssignmentSelections: Map<string, AssignmentSelection>;
  /** Whether connected to WebSocket */
  isConnected: boolean;
  /** Broadcast current cell selection to other users (debounced) */
  broadcastSelection: (selectedDays: Set<string>, selectedMemberId: string | null) => void;
  /** Clear cell selection and notify other users */
  clearSelection: () => void;
  /** Broadcast current assignment selection to other users */
  broadcastAssignmentSelection: (assignmentId: string, memberId: string | null) => void;
  /** Clear assignment selection and notify other users */
  clearAssignmentSelection: () => void;
}

export function useCellPresence({
  scheduleRoomId,
  enabled = true,
}: UseCellPresenceOptions): UseCellPresenceReturn {
  const { user, isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [otherSelections, setOtherSelections] = useState<Map<string, CellSelection>>(new Map());
  const [otherAssignmentSelections, setOtherAssignmentSelections] = useState<
    Map<string, AssignmentSelection>
  >(new Map());

  // Track the room we've joined
  const joinedRoomRef = useRef<string | null>(null);

  // Debounce timer ref for cell selections
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadRef = useRef<SelectionUpdatePayload | null>(null);

  // Debounce timer ref for assignment selections
  const assignmentDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAssignmentPayloadRef = useRef<AssignmentSelectionUpdatePayload | null>(null);

  // Debounced broadcast (50ms)
  const broadcastSelection = useCallback(
    (selectedDays: Set<string>, selectedMemberId: string | null) => {
      if (!socketRef.current || !user) return;

      const payload: SelectionUpdatePayload = {
        scheduleRoomId,
        selection: {
          userId: user.id,
          selectedDays: Array.from(selectedDays),
          selectedMemberId,
          timestamp: Date.now(),
        },
      };

      pendingPayloadRef.current = payload;

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        if (pendingPayloadRef.current && socketRef.current) {
          socketRef.current.emit('selection:update', pendingPayloadRef.current);
          pendingPayloadRef.current = null;
        }
        debounceTimerRef.current = null;
      }, 50);
    },
    [scheduleRoomId, user]
  );

  const clearSelection = useCallback(() => {
    // Clear any pending broadcast
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingPayloadRef.current = null;

    socketRef.current?.emit('selection:clear', { scheduleRoomId });
  }, [scheduleRoomId]);

  // Debounced broadcast for assignment selection (50ms)
  const broadcastAssignmentSelection = useCallback(
    (assignmentId: string, memberId: string | null) => {
      if (!socketRef.current || !user) return;

      const payload: AssignmentSelectionUpdatePayload = {
        scheduleRoomId,
        selection: {
          userId: user.id,
          assignmentId,
          memberId,
          timestamp: Date.now(),
        },
      };

      pendingAssignmentPayloadRef.current = payload;

      // Clear existing timer
      if (assignmentDebounceTimerRef.current) {
        clearTimeout(assignmentDebounceTimerRef.current);
      }

      // Set new debounce timer
      assignmentDebounceTimerRef.current = setTimeout(() => {
        if (pendingAssignmentPayloadRef.current && socketRef.current) {
          socketRef.current.emit(
            'assignment:selection:update',
            pendingAssignmentPayloadRef.current
          );
          pendingAssignmentPayloadRef.current = null;
        }
        assignmentDebounceTimerRef.current = null;
      }, 50);
    },
    [scheduleRoomId, user]
  );

  const clearAssignmentSelection = useCallback(() => {
    // Clear any pending broadcast
    if (assignmentDebounceTimerRef.current) {
      clearTimeout(assignmentDebounceTimerRef.current);
      assignmentDebounceTimerRef.current = null;
    }
    pendingAssignmentPayloadRef.current = null;

    socketRef.current?.emit('assignment:selection:clear', { scheduleRoomId });
  }, [scheduleRoomId]);

  // Effect 1: Socket connection (independent of room)
  useEffect(() => {
    if (!enabled || !isAuthenticated) return;

    const token = api.getToken();
    if (!token) return;

    const socket = io(WS_URL, {
      path: '/ws',
      auth: (cb) => {
        cb({ token: api.getToken() });
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      joinedRoomRef.current = null;
      setOtherSelections(new Map());
      setOtherAssignmentSelections(new Map());
    });

    // Handle initial sync when joining
    socket.on(
      WebSocketEvent.PRESENCE_SYNC,
      (data: { selections: CellSelection[]; assignmentSelections: AssignmentSelection[] }) => {
        const newSelections = new Map<string, CellSelection>();
        for (const selection of data.selections) {
          if (selection.userId !== user?.id) {
            newSelections.set(selection.userId, selection);
          }
        }
        setOtherSelections(newSelections);

        const newAssignmentSelections = new Map<string, AssignmentSelection>();
        for (const selection of data.assignmentSelections ?? []) {
          if (selection.userId !== user?.id) {
            newAssignmentSelections.set(selection.userId, selection);
          }
        }
        setOtherAssignmentSelections(newAssignmentSelections);
      }
    );

    // Handle selection updates from others
    socket.on(WebSocketEvent.SELECTION_UPDATE, (selection: CellSelection) => {
      if (selection.userId === user?.id) return;

      setOtherSelections((prev) => {
        const next = new Map(prev);
        next.set(selection.userId, selection);
        return next;
      });
    });

    // Handle selection clears
    socket.on(WebSocketEvent.SELECTION_CLEAR, (data: { userId: string }) => {
      if (data.userId === user?.id) return;

      setOtherSelections((prev) => {
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
    });

    // Handle assignment selection updates from others
    socket.on(WebSocketEvent.ASSIGNMENT_SELECTION_UPDATE, (selection: AssignmentSelection) => {
      if (selection.userId === user?.id) return;

      setOtherAssignmentSelections((prev) => {
        const next = new Map(prev);
        next.set(selection.userId, selection);
        return next;
      });
    });

    // Handle assignment selection clears
    socket.on(WebSocketEvent.ASSIGNMENT_SELECTION_CLEAR, (data: { userId: string }) => {
      if (data.userId === user?.id) return;

      setOtherAssignmentSelections((prev) => {
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
    });

    return () => {
      // Clean up debounce timers
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (assignmentDebounceTimerRef.current) {
        clearTimeout(assignmentDebounceTimerRef.current);
      }
      // Leave current room before disconnecting
      if (joinedRoomRef.current) {
        socket.emit('presence:leave', { scheduleRoomId: joinedRoomRef.current });
      }
      socket.disconnect();
      socketRef.current = null;
      joinedRoomRef.current = null;
    };
  }, [enabled, isAuthenticated, user?.id]);

  // Effect 2: Room management (join/leave rooms when scheduleRoomId or connection state changes)
  useEffect(() => {
    const socket = socketRef.current;

    // Need socket and connection to manage rooms
    if (!socket || !isConnected) return;

    const previousRoom = joinedRoomRef.current;

    // Leave previous room if different
    if (previousRoom && previousRoom !== scheduleRoomId) {
      socket.emit('presence:leave', { scheduleRoomId: previousRoom });
      setOtherSelections(new Map());
      setOtherAssignmentSelections(new Map());
    }

    // Join new room (or rejoin after reconnect)
    if (previousRoom !== scheduleRoomId) {
      socket.emit('presence:join', { scheduleRoomId });
      joinedRoomRef.current = scheduleRoomId;
    }
  }, [scheduleRoomId, isConnected]);

  return {
    otherSelections,
    otherAssignmentSelections,
    isConnected,
    broadcastSelection,
    clearSelection,
    broadcastAssignmentSelection,
    clearAssignmentSelection,
  };
}
