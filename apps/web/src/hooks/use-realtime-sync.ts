import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { WebSocketEvent } from '@ghostcast/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { upsertAssignmentInCache, removeAssignmentFromCache, updateRequestStatusInCache, updateRequestStatusInPaginatedCache, updateRequestTitleInCache, upsertMemberInCache, removeMemberFromCache, type CalendarMember } from '@/lib/schedule-cache';

const WS_URL = import.meta.env.VITE_WS_URL || undefined;

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const token = api.getToken();

    if (!token) {
      return;
    }

    // If socket already exists, let socket.io handle reconnection
    if (socketRef.current) {
      // If disconnected, manually trigger reconnect
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
      return;
    }

    const socket = io(WS_URL, {
      path: '/ws',
      auth: (cb) => {
        cb({ token: api.getToken() });
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      // Connected to WebSocket
    });

    socket.on('disconnect', () => {
      // Disconnected from WebSocket
    });

    socket.on('connect_error', (error) => {
      console.error('[RealtimeSync] Connection error:', error.message);
    });

    // Listen for assignment events and update caches directly from the payload
    // (the server sends the full assignment object after the DB transaction commits)
    socket.on(WebSocketEvent.ASSIGNMENT_CREATED, (payload: { data: { id: string; startDate?: string; endDate?: string; members?: Array<{ member: { id: string } }>; [key: string]: unknown } }) => {
      // Direct cache upsert from the full server payload — no API round-trip needed.
      // The mutation's onSuccess already handles the member-scoped refreshScheduleCache call,
      // so we only do the direct cache update here to avoid duplicate GETs.
      if (payload.data.startDate && payload.data.endDate) {
        upsertAssignmentInCache(queryClient, payload.data as { id: string; startDate: string; endDate: string; [key: string]: unknown });
      }
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.ASSIGNMENT_UPDATED, (payload: { data: { id: string; startDate?: string; endDate?: string; members?: Array<{ member: { id: string } }>; [key: string]: unknown } }) => {
      if (payload.data.startDate && payload.data.endDate) {
        upsertAssignmentInCache(queryClient, payload.data as { id: string; startDate: string; endDate: string; [key: string]: unknown });
      }
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.ASSIGNMENT_DELETED, (payload: { data: { id: string; memberIds?: string[] } }) => {
      removeAssignmentFromCache(queryClient, payload.data.id);
      // Cache removal by ID is sufficient — no full schedule invalidation needed
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
    });

    // Listen for request events and invalidate queries
    socket.on(WebSocketEvent.REQUEST_CREATED, () => {
      queryClient.invalidateQueries({ queryKey: ['requests'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-paginated'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-assignment'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.REQUEST_UPDATED, (payload?: { data?: { id?: string; status?: string; title?: string } }) => {
      const requestId = payload?.data?.id;
      const requestStatus = payload?.data?.status;
      const requestTitle = payload?.data?.title;

      // Update only linked assignments in schedule caches (no full calendar refetch)
      if (requestId && requestStatus) {
        updateRequestStatusInCache(queryClient, requestId, requestStatus);
        updateRequestStatusInPaginatedCache(queryClient, requestId, requestStatus);
      } else {
        // Non-status update — refresh all paginated request caches
        queryClient.invalidateQueries({ queryKey: ['requests-paginated'], refetchType: 'all' });
      }

      // Patch linked assignment titles in place when the request title changes
      if (requestId && typeof requestTitle === 'string') {
        updateRequestTitleInCache(queryClient, requestId, requestTitle);
      }

      queryClient.invalidateQueries({ queryKey: ['requests-for-assignment'], refetchType: 'all' });
      if (requestId) {
        queryClient.invalidateQueries({ queryKey: ['request', requestId], refetchType: 'all' });
      }
    });

    socket.on(WebSocketEvent.REQUEST_DELETED, () => {
      queryClient.invalidateQueries({ queryKey: ['requests'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-paginated'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-assignment'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
    });

    // Listen for member events — update schedule caches directly from the payload
    socket.on(WebSocketEvent.MEMBER_CREATED, (payload: { data: CalendarMember }) => {
      if (payload.data?.id) {
        upsertMemberInCache(queryClient, payload.data);
      }
      queryClient.invalidateQueries({ queryKey: ['members'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.MEMBER_UPDATED, (payload: { data: CalendarMember }) => {
      if (payload.data?.id) {
        upsertMemberInCache(queryClient, payload.data);
      }
      queryClient.invalidateQueries({ queryKey: ['members'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['member', payload.data?.id], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.MEMBER_DELETED, (payload: { data: { id: string } }) => {
      if (payload.data?.id) {
        removeMemberFromCache(queryClient, payload.data.id);
      }
      queryClient.invalidateQueries({ queryKey: ['members'], refetchType: 'all' });
    });
  }, [queryClient]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect if user logs out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Try to connect immediately
    connect();

    // If no token yet, retry after a short delay (token might be refreshing)
    if (!api.getToken() && !socketRef.current) {
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 1000);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated, connect]);

  return socketRef.current;
}
