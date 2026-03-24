import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PaginationDto } from '../../common/dto/pagination.dto';

export interface CreateNotificationDto {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway
  ) {}

  async findAllForUser(userId: string, pagination: PaginationDto) {
    const { page = 1, pageSize = 20 } = pagination;
    const skip = (page - 1) * pageSize;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return {
      data: notifications,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        data: (dto.data || {}) as object,
      },
    });

    // Send real-time notification
    this.realtimeGateway.emitNotification(dto.userId, notification);

    return notification;
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this notification');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async remove(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this notification');
    }

    await this.prisma.notification.delete({
      where: { id },
    });
  }

  // Helper methods for creating specific notification types

  async notifyAssignment(
    userId: string,
    assignmentTitle: string,
    action: 'assigned' | 'updated' | 'cancelled'
  ) {
    const messages = {
      assigned: `You have been assigned to: ${assignmentTitle}`,
      updated: `Assignment updated: ${assignmentTitle}`,
      cancelled: `Assignment cancelled: ${assignmentTitle}`,
    };

    return this.create({
      userId,
      type: 'ASSIGNMENT',
      title: `Assignment ${action}`,
      message: messages[action],
      data: { action },
    });
  }

  async notifySystem(userId: string, title: string, message: string) {
    return this.create({
      userId,
      type: 'SYSTEM',
      title,
      message,
    });
  }
}
