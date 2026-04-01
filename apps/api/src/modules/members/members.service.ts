import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebSocketEvent } from '@ghostcast/shared';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private buildOrderBy(sortBy?: string, sortOrder: 'asc' | 'desc' = 'asc') {
    switch (sortBy) {
      case 'name':
        return { lastName: sortOrder };
      case 'email':
        return { email: sortOrder };
      case 'department':
        return { department: sortOrder };
      case 'phone':
        return { phone: sortOrder };
      case 'position':
        return { position: sortOrder };
      case 'manager':
        return { manager: { lastName: sortOrder } };
      case 'skills':
        return { skills: { _count: sortOrder } };
      case 'roles':
        return { projectRoles: { _count: sortOrder } };
      case 'employeeId':
        return { employeeId: sortOrder };
      case 'status':
        return { isActive: sortOrder };
      case 'createdAt':
        return { createdAt: sortOrder };
      default:
        return { lastName: 'asc' as const };
    }
  }

  async findAll(pagination: PaginationDto) {
    const { page = 1, pageSize = 20, search, department, memberStatus, scheduleVisibility, sortBy, sortOrder = 'asc' } = pagination;
    const skip = (page - 1) * pageSize;

    const conditions: Record<string, unknown>[] = [];

    // Search filter
    if (search) {
      conditions.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { employeeId: { contains: search, mode: 'insensitive' as const } },
          { department: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }

    // Department filter
    if (department) {
      conditions.push({ department });
    }

    // Status filter
    if (memberStatus === 'active') {
      conditions.push({ isActive: true });
    } else if (memberStatus === 'inactive') {
      conditions.push({ isActive: false });
    }

    // Schedule visibility filter (stored in metadata.hideFromSchedule)
    if (scheduleVisibility === 'hidden') {
      conditions.push({ metadata: { path: ['hideFromSchedule'], equals: true } });
    } else if (scheduleVisibility === 'visible') {
      // Exclude members where hideFromSchedule is explicitly true
      // Members with missing key, empty metadata, or false value are included
      conditions.push({
        NOT: { metadata: { path: ['hideFromSchedule'], equals: true } },
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const [members, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: this.buildOrderBy(sortBy, sortOrder),
        include: {
          skills: {
            include: {
              skill: true,
            },
          },
          projectRoles: {
            include: {
              projectRole: true,
            },
          },
          manager: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    return {
      data: members,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        skills: {
          include: {
            skill: true,
          },
        },
        projectRoles: {
          include: {
            projectRole: true,
          },
        },
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
        unavailability: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }

  async findByIds(ids: string[]) {
    return this.prisma.member.findMany({
      where: { id: { in: ids } },
    });
  }

  async findActive() {
    return this.prisma.member.findMany({
      where: { isActive: true },
      orderBy: { lastName: 'asc' },
    });
  }

  async create(createMemberDto: CreateMemberDto) {
    if (createMemberDto.employeeId) {
      const existing = await this.prisma.member.findUnique({
        where: { employeeId: createMemberDto.employeeId },
      });

      if (existing) {
        throw new ConflictException('Member with this employee ID already exists');
      }
    }

    const member = await this.prisma.member.create({
      data: {
        employeeId: createMemberDto.employeeId,
        firstName: createMemberDto.firstName,
        lastName: createMemberDto.lastName,
        email: createMemberDto.email,
        phone: createMemberDto.phone,
        department: createMemberDto.department,
        position: createMemberDto.position,
        managerId: createMemberDto.managerId,
        resume: createMemberDto.resume,
        certification: createMemberDto.certification,
        training: createMemberDto.training,
        education: createMemberDto.education,
        notes: createMemberDto.notes,
        workingHours: createMemberDto.workingHours,
      },
    });

    // Emit real-time event
    this.realtimeGateway.emitToAll(WebSocketEvent.MEMBER_CREATED, member);

    return member;
  }

  async update(id: string, updateMemberDto: UpdateMemberDto) {
    await this.findById(id); // Ensure member exists

    const { metadata, ...rest } = updateMemberDto;
    const member = await this.prisma.member.update({
      where: { id },
      data: {
        ...rest,
        ...(metadata !== undefined && { metadata: metadata as object }),
      },
    });

    // Emit real-time event
    this.realtimeGateway.emitToAll(WebSocketEvent.MEMBER_UPDATED, member);

    return member;
  }

  async remove(id: string) {
    await this.findById(id); // Ensure member exists

    await this.prisma.member.delete({
      where: { id },
    });

    // Emit real-time event
    this.realtimeGateway.emitToAll(WebSocketEvent.MEMBER_DELETED, { id });
  }

  async getMemberSkills(id: string) {
    await this.findById(id); // Ensure member exists

    return this.prisma.memberSkill.findMany({
      where: { memberId: id },
      include: {
        skill: true,
      },
    });
  }

  async getMemberUnavailability(id: string) {
    await this.findById(id); // Ensure member exists

    return this.prisma.memberUnavailability.findMany({
      where: { memberId: id },
      orderBy: { startDate: 'asc' },
    });
  }

  async addMemberSkill(memberId: string, skillId: string, level: number = 1) {
    return this.prisma.memberSkill.upsert({
      where: {
        memberId_skillId: { memberId, skillId },
      },
      create: { memberId, skillId, level },
      update: { level },
    });
  }

  async removeMemberSkill(memberId: string, skillId: string) {
    return this.prisma.memberSkill.deleteMany({
      where: { memberId, skillId },
    });
  }

  async addUnavailability(
    memberId: string,
    startDate: Date,
    endDate: Date,
    reason?: string
  ) {
    return this.prisma.memberUnavailability.create({
      data: {
        memberId,
        startDate,
        endDate,
        reason,
      },
    });
  }

  // Project Role Management
  async getMemberProjectRoles(memberId: string) {
    await this.findById(memberId);
    return this.prisma.memberProjectRole.findMany({
      where: { memberId },
      include: { projectRole: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addMemberProjectRole(memberId: string, projectRoleId: string, dateAwarded?: Date) {
    await this.findById(memberId);

    return this.prisma.memberProjectRole.upsert({
      where: {
        memberId_projectRoleId: { memberId, projectRoleId },
      },
      create: { memberId, projectRoleId, dateAwarded },
      update: { dateAwarded },
      include: { projectRole: true, member: { select: { firstName: true, lastName: true } } },
    });
  }

  async removeMemberProjectRole(memberId: string, projectRoleId: string) {
    return this.prisma.memberProjectRole.deleteMany({
      where: { memberId, projectRoleId },
    });
  }

  async updateMemberSkillLevel(memberId: string, skillId: string, level: number) {
    if (level < 1 || level > 5) {
      throw new BadRequestException('Skill level must be between 1 and 5');
    }

    return this.prisma.memberSkill.upsert({
      where: { memberId_skillId: { memberId, skillId } },
      create: { memberId, skillId, level },
      update: { level },
      include: { skill: true, member: { select: { firstName: true, lastName: true } } },
    });
  }

  async getMemberAssignmentStats(memberId: string) {
    await this.findById(memberId); // Verify member exists

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        members: { some: { memberId } },
        startDate: { gte: oneYearAgo },
      },
      include: {
        projectType: true,
        request: {
          include: {
            projectType: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    // Separate into linked (has request) and unlinked (no request)
    const linkedAssignments = assignments.filter((a) => a.requestId !== null);
    const unlinkedAssignments = assignments.filter((a) => a.requestId === null);

    // For linked: group by request's project type, count unique requests
    const linkedStats = this.groupByRequestProjectType(linkedAssignments);

    // For unlinked: group by assignment's project type
    const unlinkedStats = this.groupByAssignmentProjectType(unlinkedAssignments);

    return {
      linkedRequests: linkedStats,
      noLinkedRequest: unlinkedStats,
    };
  }

  private groupByRequestProjectType(
    assignments: Array<{
      requestId: string | null;
      startDate: Date;
      request: {
        id: string;
        projectType: {
          id: string;
          name: string;
          color: string;
          abbreviation: string | null;
        } | null;
      } | null;
    }>
  ) {
    const projectTypeMap = new Map<
      string,
      {
        projectType: { id: string; name: string; color: string; abbreviation: string | null };
        requestIds: Set<string>;
        lastDate: Date;
      }
    >();

    for (const assignment of assignments) {
      const projectType = assignment.request?.projectType;
      if (!projectType) continue;

      const existing = projectTypeMap.get(projectType.id);
      if (existing) {
        existing.requestIds.add(assignment.requestId!);
        if (assignment.startDate > existing.lastDate) {
          existing.lastDate = assignment.startDate;
        }
      } else {
        projectTypeMap.set(projectType.id, {
          projectType,
          requestIds: new Set([assignment.requestId!]),
          lastDate: assignment.startDate,
        });
      }
    }

    return Array.from(projectTypeMap.values())
      .map((entry) => ({
        projectTypeId: entry.projectType.id,
        projectTypeName: entry.projectType.name,
        projectTypeColor: entry.projectType.color,
        projectTypeAbbreviation: entry.projectType.abbreviation,
        count: entry.requestIds.size,
        lastAssignmentDate: entry.lastDate,
      }))
      .sort((a, b) => b.lastAssignmentDate.getTime() - a.lastAssignmentDate.getTime());
  }

  private groupByAssignmentProjectType(
    assignments: Array<{
      projectTypeId: string;
      startDate: Date;
      projectType: {
        id: string;
        name: string;
        color: string;
        abbreviation: string | null;
      };
    }>
  ) {
    const projectTypeMap = new Map<
      string,
      {
        projectType: { id: string; name: string; color: string; abbreviation: string | null };
        count: number;
        lastDate: Date;
      }
    >();

    for (const assignment of assignments) {
      const existing = projectTypeMap.get(assignment.projectTypeId);
      if (existing) {
        existing.count++;
        if (assignment.startDate > existing.lastDate) {
          existing.lastDate = assignment.startDate;
        }
      } else {
        projectTypeMap.set(assignment.projectTypeId, {
          projectType: assignment.projectType,
          count: 1,
          lastDate: assignment.startDate,
        });
      }
    }

    return Array.from(projectTypeMap.values())
      .map((entry) => ({
        projectTypeId: entry.projectType.id,
        projectTypeName: entry.projectType.name,
        projectTypeColor: entry.projectType.color,
        projectTypeAbbreviation: entry.projectType.abbreviation,
        count: entry.count,
        lastAssignmentDate: entry.lastDate,
      }))
      .sort((a, b) => b.lastAssignmentDate.getTime() - a.lastAssignmentDate.getTime());
  }
}
