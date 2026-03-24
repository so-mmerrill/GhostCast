import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketEvent,
  PresenceUser,
  CellSelection,
  SelectionUpdatePayload,
  AssignmentSelection,
  AssignmentSelectionUpdatePayload,
} from '@ghostcast/shared';
import { PrismaService } from '../../database/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  userInfo?: PresenceUser;
}

// 8-color palette for user presence indicators
const PRESENCE_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#8B5CF6', // violet-500
  '#F59E0B', // amber-500
  '#F43F5E', // rose-500
  '#06B6D4', // cyan-500
  '#6366F1', // indigo-500
  '#D946EF', // fuchsia-500
];

function getUserColor(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length] ?? '#3B82F6';
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
  path: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly connectedClients: Map<string, AuthenticatedSocket> = new Map();

  // Presence tracking: Map<scheduleRoomId, Map<userId, CellSelection>>
  private readonly schedulePresence: Map<string, Map<string, CellSelection>> = new Map();
  // Assignment selection tracking: Map<scheduleRoomId, Map<userId, AssignmentSelection>>
  private readonly assignmentPresence: Map<string, Map<string, AssignmentSelection>> = new Map();
  // Track which rooms each user is in: Map<userId, Set<roomId>>
  private readonly userPresenceRooms: Map<string, Set<string>> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      client.userId = payload.sub;
      client.userRole = payload.role;

      // Fetch user info from database for presence display
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, firstName: true, lastName: true, avatar: true },
      });

      const firstName = user?.firstName ?? 'Unknown';
      const lastName = user?.lastName ?? 'User';
      const fullName = `${firstName} ${lastName}`;
      client.userInfo = {
        id: payload.sub,
        firstName,
        lastName,
        avatar: user?.avatar ?? null,
        color: getUserColor(fullName),
      };

      this.connectedClients.set(client.id, client);

      // Join user-specific room for targeted notifications
      client.join(`user:${payload.sub}`);

      this.logger.log(`Client ${client.id} connected (User: ${payload.sub})`);
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    // Clean up presence from all rooms this user was in
    if (client.userId) {
      const rooms = this.userPresenceRooms.get(client.userId);
      if (rooms) {
        for (const roomId of rooms) {
          this.cleanupUserFromRoom(client, roomId);
        }
        this.userPresenceRooms.delete(client.userId);
      }
    }

    this.connectedClients.delete(client.id);
    this.logger.log(`Client ${client.id} disconnected`);
  }

  private cleanupUserFromRoom(client: AuthenticatedSocket, scheduleRoomId: string) {
    if (!client.userId) return;

    client.leave(scheduleRoomId);

    // Remove from room tracking
    this.userPresenceRooms.get(client.userId)?.delete(scheduleRoomId);

    // Clear their cell selection from the room
    const roomPresence = this.schedulePresence.get(scheduleRoomId);
    if (roomPresence) {
      roomPresence.delete(client.userId);

      // Clean up empty rooms
      if (roomPresence.size === 0) {
        this.schedulePresence.delete(scheduleRoomId);
      }
    }

    // Clear their assignment selection from the room
    const assignmentRoomPresence = this.assignmentPresence.get(scheduleRoomId);
    if (assignmentRoomPresence) {
      assignmentRoomPresence.delete(client.userId);

      // Clean up empty rooms
      if (assignmentRoomPresence.size === 0) {
        this.assignmentPresence.delete(scheduleRoomId);
      }
    }

    // Notify others in the room
    this.server.to(scheduleRoomId).emit(WebSocketEvent.SELECTION_CLEAR, {
      userId: client.userId,
    });
    this.server.to(scheduleRoomId).emit(WebSocketEvent.ASSIGNMENT_SELECTION_CLEAR, {
      userId: client.userId,
    });

    this.logger.debug(`User ${client.userId} left presence room ${scheduleRoomId}`);
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const token = client.handshake.auth?.token;
    if (token) {
      return token;
    }

    return null;
  }

  @SubscribeMessage('subscribe:calendar')
  handleSubscribeCalendar(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { startDate: string; endDate: string }
  ) {
    const roomName = `calendar:${data.startDate}:${data.endDate}`;
    client.join(roomName);
    this.logger.debug(`Client ${client.id} subscribed to ${roomName}`);
    return { success: true, room: roomName };
  }

  @SubscribeMessage('unsubscribe:calendar')
  handleUnsubscribeCalendar(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { startDate: string; endDate: string }
  ) {
    const roomName = `calendar:${data.startDate}:${data.endDate}`;
    client.leave(roomName);
    this.logger.debug(`Client ${client.id} unsubscribed from ${roomName}`);
    return { success: true };
  }

  // =========================================
  // Presence / Cell Selection Handlers
  // =========================================

  @SubscribeMessage('presence:join')
  handlePresenceJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleRoomId: string }
  ) {
    if (!client.userId || !client.userInfo) {
      return { success: false };
    }

    const { scheduleRoomId } = data;
    client.join(scheduleRoomId);

    // Track room membership
    if (!this.userPresenceRooms.has(client.userId)) {
      this.userPresenceRooms.set(client.userId, new Set());
    }
    this.userPresenceRooms.get(client.userId)!.add(scheduleRoomId);

    // Initialize room presence if needed
    if (!this.schedulePresence.has(scheduleRoomId)) {
      this.schedulePresence.set(scheduleRoomId, new Map());
    }
    if (!this.assignmentPresence.has(scheduleRoomId)) {
      this.assignmentPresence.set(scheduleRoomId, new Map());
    }

    // Send current presence state to the joining user
    const roomPresence = this.schedulePresence.get(scheduleRoomId)!;
    const selections = Array.from(roomPresence.values());

    const assignmentRoomPresence = this.assignmentPresence.get(scheduleRoomId)!;
    const assignmentSelections = Array.from(assignmentRoomPresence.values());

    client.emit(WebSocketEvent.PRESENCE_SYNC, { selections, assignmentSelections });

    this.logger.debug(`User ${client.userId} joined presence room ${scheduleRoomId}`);
    return { success: true };
  }

  @SubscribeMessage('presence:leave')
  handlePresenceLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleRoomId: string }
  ) {
    if (!client.userId) {
      return { success: false };
    }
    this.cleanupUserFromRoom(client, data.scheduleRoomId);
    return { success: true };
  }

  @SubscribeMessage('selection:update')
  handleSelectionUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SelectionUpdatePayload
  ) {
    if (!client.userId || !client.userInfo) return;

    const { scheduleRoomId, selection } = data;

    // Ensure room exists
    if (!this.schedulePresence.has(scheduleRoomId)) {
      this.schedulePresence.set(scheduleRoomId, new Map());
    }

    const roomPresence = this.schedulePresence.get(scheduleRoomId)!;

    const fullSelection: CellSelection = {
      ...selection,
      user: client.userInfo,
    };

    roomPresence.set(client.userId, fullSelection);

    // Broadcast to others in the room (exclude sender)
    client.to(scheduleRoomId).emit(WebSocketEvent.SELECTION_UPDATE, fullSelection);
  }

  @SubscribeMessage('selection:clear')
  handleSelectionClear(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleRoomId: string }
  ) {
    if (!client.userId) return;

    const { scheduleRoomId } = data;
    const roomPresence = this.schedulePresence.get(scheduleRoomId);

    if (roomPresence) {
      roomPresence.delete(client.userId);
    }

    client.to(scheduleRoomId).emit(WebSocketEvent.SELECTION_CLEAR, {
      userId: client.userId,
    });
  }

  // =========================================
  // Assignment Selection Handlers
  // =========================================

  @SubscribeMessage('assignment:selection:update')
  handleAssignmentSelectionUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: AssignmentSelectionUpdatePayload
  ) {
    if (!client.userId || !client.userInfo) return;

    const { scheduleRoomId, selection } = data;

    // Ensure room exists
    if (!this.assignmentPresence.has(scheduleRoomId)) {
      this.assignmentPresence.set(scheduleRoomId, new Map());
    }

    const roomPresence = this.assignmentPresence.get(scheduleRoomId)!;

    const fullSelection: AssignmentSelection = {
      ...selection,
      user: client.userInfo,
    };

    roomPresence.set(client.userId, fullSelection);

    // Broadcast to others in the room (exclude sender)
    client.to(scheduleRoomId).emit(WebSocketEvent.ASSIGNMENT_SELECTION_UPDATE, fullSelection);
  }

  @SubscribeMessage('assignment:selection:clear')
  handleAssignmentSelectionClear(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { scheduleRoomId: string }
  ) {
    if (!client.userId) return;

    const { scheduleRoomId } = data;
    const roomPresence = this.assignmentPresence.get(scheduleRoomId);

    if (roomPresence) {
      roomPresence.delete(client.userId);
    }

    client.to(scheduleRoomId).emit(WebSocketEvent.ASSIGNMENT_SELECTION_CLEAR, {
      userId: client.userId,
    });
  }

  // Emit methods for use by other services

  emitToAll(event: WebSocketEvent | string, data: unknown) {
    this.server.emit(event, {
      event,
      data,
      timestamp: new Date(),
    });
  }

  emitToUser(userId: string, event: WebSocketEvent | string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, {
      event,
      data,
      timestamp: new Date(),
    });
  }

  emitToRoom(room: string, event: WebSocketEvent | string, data: unknown) {
    this.server.to(room).emit(event, {
      event,
      data,
      timestamp: new Date(),
    });
  }

  emitNotification(userId: string, notification: unknown) {
    this.emitToUser(userId, WebSocketEvent.NOTIFICATION_NEW, notification);
  }

  emitAssignmentUpdate(assignment: unknown) {
    this.emitToAll(WebSocketEvent.ASSIGNMENT_UPDATED, assignment);
  }

  getConnectedClients(): number {
    return this.connectedClients.size;
  }
}
