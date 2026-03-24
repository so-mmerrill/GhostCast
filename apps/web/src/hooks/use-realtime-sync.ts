import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { WebSocketEvent } from '@ghostcast/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { upsertAssignmentInCache, removeAssignmentFromCache, updateRequestStatusInCache } from '@/lib/schedule-cache';

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
      auth: { token },
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
    socket.on(WebSocketEvent.ASSIGNMENT_CREATED, (payload: { data: { id: string; startDate?: string; endDate?: string; [key: string]: unknown } }) => {
      if (payload.data.startDate && payload.data.endDate) {
        upsertAssignmentInCache(queryClient, payload.data as { id: string; startDate: string; endDate: string; [key: string]: unknown });
      }
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.ASSIGNMENT_UPDATED, (payload: { data: { id: string; startDate?: string; endDate?: string; [key: string]: unknown } }) => {
      if (payload.data.startDate && payload.data.endDate) {
        upsertAssignmentInCache(queryClient, payload.data as { id: string; startDate: string; endDate: string; [key: string]: unknown });
      }
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.ASSIGNMENT_DELETED, (payload: { data: { id: string } }) => {
      removeAssignmentFromCache(queryClient, payload.data.id);
      // Invalidate schedule as a safety net in case removeAssignmentFromCache missed it
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
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

    socket.on(WebSocketEvent.REQUEST_UPDATED, (payload?: { id?: string; status?: string }) => {
      // Immediately update assignment styling in schedule caches
      if (payload?.id && payload?.status) {
        updateRequestStatusInCache(queryClient, payload.id, payload.status);
      }
      queryClient.invalidateQueries({ queryKey: ['requests'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-paginated'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-assignment'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.REQUEST_DELETED, () => {
      queryClient.invalidateQueries({ queryKey: ['requests'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-paginated'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['requests-for-assignment'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['request'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
    });

    // Listen for member events
    socket.on(WebSocketEvent.MEMBER_CREATED, () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['members'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.MEMBER_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['members'], refetchType: 'all' });
    });

    socket.on(WebSocketEvent.MEMBER_DELETED, () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
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
