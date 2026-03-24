import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebSocketEvent } from '@ghostcast/shared';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway
  ) {}

  private readonly projectRolesInclude = {
    projectRoles: {
      include: {
        projectRole: {
          include: {
            formatters: {
              include: {
                formatter: true,
              },
            },
          },
        },
      },
    },
  };

  async findAll(pagination: PaginationDto) {
    const { page = 1, pageSize = 20, search } = pagination;
    const skip = (page - 1) * pageSize;

    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [assignments, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { startDate: 'asc' },
        include: {
          projectType: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          members: {
            include: {
              member: true,
            },
          },
          requiredSkills: {
            include: {
              skill: true,
            },
          },
          ...this.projectRolesInclude,
        },
      }),
      this.prisma.assignment.count({ where }),
    ]);

    return {
      data: assignments,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        projectType: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        members: {
          include: {
            member: true,
          },
        },
        requiredSkills: {
          include: {
            skill: true,
          },
        },
        formatters: {
          include: {
            formatter: true,
          },
        },
        ...this.projectRolesInclude,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async getCalendarView(query: CalendarQueryDto) {
    const { startDate, endDate, memberIds, projectTypeIds, statuses, includeUnscheduledAndForecasts } = query;

    // Convert date strings to Date objects for Prisma DateTime fields
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);

    // Build the date range condition for assignments within the quarter
    const dateRangeCondition = {
      OR: [
        {
          startDate: { gte: startDateTime, lte: endDateTime },
        },
        {
          endDate: { gte: startDateTime, lte: endDateTime },
        },
        {
          AND: [
            { startDate: { lte: startDateTime } },
            { endDate: { gte: endDateTime } },
          ],
        },
      ],
    };

    // Build the main where clause
    let where: Record<string, unknown>;

    if (includeUnscheduledAndForecasts) {
      // Include assignments within date range OR linked to unscheduled/forecast requests
      where = {
        OR: [
          dateRangeCondition,
          {
            request: {
              status: { in: ['UNSCHEDULED', 'FORECAST'] },
            },
          },
        ],
      };
    } else {
      where = dateRangeCondition;
    }

    if (memberIds && memberIds.length > 0) {
      where.members = {
        some: {
          memberId: { in: memberIds },
        },
      };
    }

    if (projectTypeIds && projectTypeIds.length > 0) {
      where.projectTypeId = { in: projectTypeIds };
    }

    if (statuses && statuses.length > 0) {
      where.status = { in: statuses };
    }

    // Run both queries in parallel for better performance
    const [assignments, members] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: {
          projectType: true,
          request: {
            select: {
              id: true,
              status: true,
            },
          },
          members: {
            include: {
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  department: true,
                },
              },
            },
          },
          requiredSkills: {
            include: {
              skill: true,
            },
          },
          formatters: {
            include: {
              formatter: true,
            },
          },
          ...this.projectRolesInclude,
        },
        orderBy: { startDate: 'asc' },
      }),
      // Get all active members for the calendar view (including managerId for hierarchy)
      this.prisma.member.findMany({
        where: memberIds && memberIds.length > 0
          ? { id: { in: memberIds }, isActive: true }
          : { isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
          position: true,
          managerId: true,
          metadata: true,
        },
        orderBy: { lastName: 'asc' },
      }),
    ]);

    return {
      assignments,
      members,
      dateRange: {
        startDate,
        endDate,
      },
    };
  }

  async create(createAssignmentDto: CreateAssignmentDto, createdById: string) {
    const { memberIds, skillIds, formatterIds, projectRoleIds, metadata, ...assignmentData } = createAssignmentDto;

    // Validate that all provided member IDs exist
    if (memberIds?.length) {
      const existingMembers = await this.prisma.member.findMany({
        where: { id: { in: memberIds } },
        select: { id: true },
      });
      const existingMemberIds = new Set(existingMembers.map((m) => m.id));
      const invalidMemberIds = memberIds.filter((id) => !existingMemberIds.has(id));
      if (invalidMemberIds.length > 0) {
        throw new BadRequestException(`Invalid member IDs: ${invalidMemberIds.join(', ')}`);
      }
    }

    const assignment = await this.prisma.assignment.create({
      data: {
        ...assignmentData,
        ...(metadata ? { metadata: metadata as object } : {}),
        createdById,
        members: memberIds
          ? {
              create: memberIds.map((memberId) => ({ memberId })),
            }
          : undefined,
        requiredSkills: skillIds
          ? {
              create: skillIds.map((skillId) => ({ skillId })),
            }
          : undefined,
        formatters: formatterIds
          ? {
              create: formatterIds.map((formatterId) => ({ formatterId })),
            }
          : undefined,
        projectRoles: projectRoleIds
          ? {
              create: projectRoleIds.map((projectRoleId) => ({ projectRoleId })),
            }
          : undefined,
      },
      include: {
        projectType: true,
        request: {
          select: {
            id: true,
            status: true,
          },
        },
        members: {
          include: {
            member: true,
          },
        },
        requiredSkills: {
          include: {
            skill: true,
          },
        },
        formatters: {
          include: {
            formatter: true,
          },
        },
        ...this.projectRolesInclude,
      },
    });

    // Emit real-time event
    this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_CREATED, assignment);

    return assignment;
  }

  async update(id: string, updateAssignmentDto: UpdateAssignmentDto) {
    const existingAssignment = await this.findById(id); // Ensure assignment exists

    const { memberIds, skillIds, formatterIds, projectRoleIds, metadata, ...assignmentData } = updateAssignmentDto;

    // Merge metadata if provided (instead of replacing entirely)
    const mergedMetadata = metadata
      ? { ...(existingAssignment.metadata as Record<string, unknown>), ...metadata }
      : undefined;

    // Validate that all provided IDs exist before updating relations
    if (memberIds?.length) {
      const existingMembers = await this.prisma.member.findMany({
        where: { id: { in: memberIds } },
        select: { id: true },
      });
      const existingMemberIds = new Set(existingMembers.map((m) => m.id));
      const invalidMemberIds = memberIds.filter((id) => !existingMemberIds.has(id));
      if (invalidMemberIds.length > 0) {
        throw new BadRequestException(`Invalid member IDs: ${invalidMemberIds.join(', ')}`);
      }
    }

    // Update assignment and relations
    const assignment = await this.prisma.$transaction(async (tx) => {
      // Update member relations if provided
      if (memberIds !== undefined) {
        await tx.assignmentMember.deleteMany({
          where: { assignmentId: id },
        });
        if (memberIds.length > 0) {
          await tx.assignmentMember.createMany({
            data: memberIds.map((memberId) => ({ assignmentId: id, memberId })),
          });
        }
      }

      // Update skill relations if provided
      if (skillIds !== undefined) {
        await tx.assignmentSkill.deleteMany({
          where: { assignmentId: id },
        });
        if (skillIds.length > 0) {
          await tx.assignmentSkill.createMany({
            data: skillIds.map((skillId) => ({ assignmentId: id, skillId })),
          });
        }
      }

      // Update formatter relations if provided
      if (formatterIds !== undefined) {
        await tx.assignmentFormatter.deleteMany({
          where: { assignmentId: id },
        });
        if (formatterIds.length > 0) {
          await tx.assignmentFormatter.createMany({
            data: formatterIds.map((formatterId) => ({ assignmentId: id, formatterId })),
          });
        }
      }

      // Update project role relations if provided
      if (projectRoleIds !== undefined) {
        await tx.assignmentProjectRole.deleteMany({
          where: { assignmentId: id },
        });
        if (projectRoleIds.length > 0) {
          await tx.assignmentProjectRole.createMany({
            data: projectRoleIds.map((projectRoleId) => ({ assignmentId: id, projectRoleId })),
          });
        }
      }

      // Build update data with merged metadata if provided
      const updateData: Parameters<typeof tx.assignment.update>[0]['data'] = {
        ...assignmentData,
      };
      if (mergedMetadata !== undefined) {
        updateData.metadata = mergedMetadata as typeof updateData.metadata;
      }

      // Update assignment
      return tx.assignment.update({
        where: { id },
        data: updateData,
        include: {
          projectType: true,
          request: {
            select: {
              id: true,
              status: true,
            },
          },
          members: {
            include: {
              member: true,
            },
          },
          requiredSkills: {
            include: {
              skill: true,
            },
          },
          formatters: {
            include: {
              formatter: true,
            },
          },
          ...this.projectRolesInclude,
        },
      });
    });

    // Emit real-time event
    this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_UPDATED, assignment);

    return assignment;
  }

  async remove(id: string) {
    const assignment = await this.findById(id);

    await this.prisma.assignment.delete({
      where: { id },
    });

    // Emit real-time event with dates for targeted cache invalidation
    this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_DELETED, {
      id,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
    });
  }
}
