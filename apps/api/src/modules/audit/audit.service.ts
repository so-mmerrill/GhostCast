import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AuditQueryDto) {
    const {
      page = 1,
      pageSize = 50,
      userId,
      action,
      entity,
      entityId,
      startDate,
      endDate,
      search,
    } = query;

    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        (where.createdAt as Record<string, Date>).lte = new Date(endDate);
      }
    }

    if (search) {
      const searchLower = search.toLowerCase();
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        {
          metadata: {
            path: ['entityName'],
            string_contains: search,
          },
        },
        {
          metadata: {
            path: ['entityName'],
            string_contains: searchLower,
          },
        },
        {
          metadata: {
            path: ['entityName'],
            string_contains: search.toUpperCase(),
          },
        },
        {
          metadata: {
            path: ['entityName'],
            string_contains: search.charAt(0).toUpperCase() + searchLower.slice(1),
          },
        },
      ];
    }

    const [auditLogs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: auditLogs,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getDistinctEntities(): Promise<string[]> {
    const result = await this.prisma.auditLog.findMany({
      distinct: ['entity'],
      select: { entity: true },
    });
    return result.map((r) => r.entity);
  }

  async getDistinctActions(): Promise<string[]> {
    const result = await this.prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
    });
    return result.map((r) => r.action);
  }

  async create(data: {
    userId?: string;
    action: string;
    entity: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        oldValue: data.oldValue as never,
        newValue: data.newValue as never,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: (data.metadata || {}) as object,
      },
    });
  }
}
