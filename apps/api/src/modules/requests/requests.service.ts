import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { QueryRequestDto } from './dto/query-request.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebSocketEvent, RequestStatus } from '@ghostcast/shared';

const requestInclude = {
  requester: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  projectType: true,
  requiredMembers: {
    include: {
      member: true,
    },
  },
  requiredSkills: {
    include: {
      skill: true,
    },
  },
  assignments: {
    include: {
      members: {
        include: {
          member: true,
        },
      },
      projectRoles: {
        include: {
          projectRole: true,
        },
      },
    },
  },
};

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway
  ) {}

  private buildStatusConditionsWithDateRange(
    statuses: string[],
    startDateTime: Date,
    endDateTime: Date
  ): Record<string, unknown>[] {
    const conditions: Record<string, unknown>[] = [];

    if (statuses.includes('UNSCHEDULED')) {
      conditions.push({ status: 'UNSCHEDULED' });
    }
    if (statuses.includes('FORECAST')) {
      conditions.push({ status: 'FORECAST' });
    }
    if (statuses.includes('SCHEDULED')) {
      conditions.push({
        status: 'SCHEDULED',
        assignments: {
          some: {
            OR: [
              { startDate: { gte: startDateTime, lte: endDateTime } },
              { endDate: { gte: startDateTime, lte: endDateTime } },
              { AND: [{ startDate: { lte: startDateTime } }, { endDate: { gte: endDateTime } }] },
            ],
          },
        },
      });
    }

    return conditions;
  }

  private applyScheduledDateFilter(
    where: Record<string, unknown>,
    statusList: string[],
    scheduledWithinStartDate: string,
    scheduledWithinEndDate: string
  ): void {
    const conditions = this.buildStatusConditionsWithDateRange(
      statusList,
      new Date(scheduledWithinStartDate),
      new Date(scheduledWithinEndDate)
    );
    if (conditions.length === 0) return;

    if (statusList.length === 1) {
      Object.assign(where, conditions[0]);
    } else {
      where.OR = where.OR
        ? { AND: [{ OR: where.OR }, { OR: conditions }] }
        : conditions;
    }
  }

  private applyStatusFilter(
    where: Record<string, unknown>,
    query: QueryRequestDto
  ): void {
    const { status, statuses, scheduledWithinStartDate, scheduledWithinEndDate } = query;

    if (status) {
      if (status === 'SCHEDULED' && scheduledWithinStartDate && scheduledWithinEndDate) {
        this.applyScheduledDateFilter(where, [status], scheduledWithinStartDate, scheduledWithinEndDate);
      } else {
        where.status = status;
      }
      return;
    }

    if (!statuses || statuses.length === 0) {
      return;
    }

    if (scheduledWithinStartDate && scheduledWithinEndDate) {
      this.applyScheduledDateFilter(where, statuses, scheduledWithinStartDate, scheduledWithinEndDate);
    } else {
      where.status = { in: statuses };
    }
  }

  async findAll(query: QueryRequestDto) {
    const { page = 1, pageSize = 20, search, sortBy, sortOrder = 'desc' } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    this.applyStatusFilter(where, query);

    let orderBy: Record<string, unknown>[] = [{ status: 'asc' }, { createdAt: 'desc' }];
    if (sortBy) {
      const primarySort = sortBy === 'requester'
        ? { requester: { firstName: sortOrder } }
        : { [sortBy]: sortOrder };
      orderBy = sortBy === 'createdAt'
        ? [primarySort]
        : [primarySort, { createdAt: 'desc' as const }];
    }

    const [requests, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: requestInclude,
      }),
      this.prisma.request.count({ where }),
    ]);

    return {
      data: requests,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: requestInclude,
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }

  async create(createRequestDto: CreateRequestDto, requesterId: string) {
    const { memberIds, skillIds, ...requestData } = createRequestDto;

    const request = await this.prisma.request.create({
      data: {
        ...requestData,
        requesterId,
        requiredMembers: memberIds?.length
          ? {
              create: memberIds.map((memberId) => ({ memberId })),
            }
          : undefined,
        requiredSkills: skillIds?.length
          ? {
              create: skillIds.map((skillId) => ({ skillId })),
            }
          : undefined,
      },
      include: requestInclude,
    });

    this.realtimeGateway.emitToAll(WebSocketEvent.REQUEST_CREATED, request);

    return request;
  }

  async update(id: string, updateRequestDto: UpdateRequestDto) {
    const existingRequest = await this.findById(id);

    const { memberIds, skillIds, ...requestData } = updateRequestDto;

    const projectTypeChanged =
      requestData.projectTypeId !== undefined &&
      requestData.projectTypeId !== existingRequest.projectTypeId;

    const isCancelling =
      requestData.status === RequestStatus.CANCELLED &&
      existingRequest.status !== RequestStatus.CANCELLED;

    // Collect assignment info before deletion so we can emit proper WebSocket events
    let deletedAssignments: Array<{ id: string; startDate: Date; endDate: Date; memberIds: string[] }> = [];
    if (isCancelling) {
      const assignments = await this.prisma.assignment.findMany({
        where: { requestId: id },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          members: { select: { memberId: true } },
        },
      });
      deletedAssignments = assignments.map((a) => ({
        id: a.id,
        startDate: a.startDate,
        endDate: a.endDate,
        memberIds: a.members.map((m) => m.memberId),
      }));
    }

    const request = await this.prisma.$transaction(async (tx) => {
      // Update member relations if provided
      if (memberIds !== undefined) {
        await tx.requestMember.deleteMany({
          where: { requestId: id },
        });
        if (memberIds.length > 0) {
          await tx.requestMember.createMany({
            data: memberIds.map((memberId) => ({ requestId: id, memberId })),
          });
        }
      }

      // Update skill relations if provided
      if (skillIds !== undefined) {
        await tx.requestSkill.deleteMany({
          where: { requestId: id },
        });
        if (skillIds.length > 0) {
          await tx.requestSkill.createMany({
            data: skillIds.map((skillId) => ({ requestId: id, skillId })),
          });
        }
      }

      // If project type changed, update all linked assignments
      if (projectTypeChanged && requestData.projectTypeId) {
        await tx.assignment.updateMany({
          where: { requestId: id },
          data: { projectTypeId: requestData.projectTypeId },
        });
      }

      // Delete all linked assignments when cancelling
      if (isCancelling) {
        await tx.assignment.deleteMany({
          where: { requestId: id },
        });
      }

      // Update request
      return tx.request.update({
        where: { id },
        data: requestData,
        include: requestInclude,
      });
    });

    // Emit deletion events for each assignment so clients remove them from schedule caches
    for (const assignment of deletedAssignments) {
      this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_DELETED, assignment);
    }

    this.realtimeGateway.emitToAll(WebSocketEvent.REQUEST_UPDATED, request);

    // If assignments were updated, notify clients to refresh assignment data
    if (projectTypeChanged && requestData.projectTypeId) {
      this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_UPDATED, { requestId: id });
    }

    return request;
  }

  async remove(id: string) {
    await this.findById(id);

    await this.prisma.request.delete({
      where: { id },
    });

    this.realtimeGateway.emitToAll(WebSocketEvent.REQUEST_DELETED, { id });
  }

  async removeAssignments(id: string) {
    await this.findById(id);

    await this.prisma.assignment.deleteMany({
      where: { requestId: id },
    });

    // Emit event to update all clients
    this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_DELETED, { requestId: id });
  }
}
