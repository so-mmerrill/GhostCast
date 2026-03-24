import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllConfig(category?: string) {
    const where = category ? { category } : {};

    const configs = await this.prisma.systemConfig.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    return configs;
  }

  async getConfig(key: string) {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key },
    });

    if (!config) {
      throw new NotFoundException(`Config key '${key}' not found`);
    }

    return config;
  }

  async updateConfig(key: string, value: unknown) {
    const config = await this.prisma.systemConfig.upsert({
      where: { key },
      create: {
        key,
        value: value as never,
        category: key.split('.')[0] || 'general',
      },
      update: {
        value: value as never,
      },
    });

    return config;
  }

  async getDashboardStats() {
    const [
      usersCount,
      activeUsersCount,
      membersCount,
      activeMembersCount,
      assignmentsCount,
      projectTypesCount,
      recentAuditLogs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.member.count(),
      this.prisma.member.count({ where: { isActive: true } }),
      this.prisma.assignment.count(),
      this.prisma.projectType.count({ where: { isActive: true } }),
      this.prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    // Assignment status breakdown
    const assignmentsByStatus = await this.prisma.assignment.groupBy({
      by: ['status'],
      _count: true,
    });

    // Assignments by project type
    const assignmentsByProjectType = await this.prisma.assignment.groupBy({
      by: ['projectTypeId'],
      _count: true,
    });

    return {
      users: {
        total: usersCount,
        active: activeUsersCount,
      },
      members: {
        total: membersCount,
        active: activeMembersCount,
      },
      assignments: {
        total: assignmentsCount,
        byStatus: assignmentsByStatus.reduce(
          (acc: Record<string, number>, item: { status: string; _count: number }) => {
            acc[item.status] = item._count;
            return acc;
          },
          {} as Record<string, number>
        ),
        byProjectType: assignmentsByProjectType,
      },
      projectTypes: projectTypesCount,
      recentActivity: recentAuditLogs,
    };
  }
}
