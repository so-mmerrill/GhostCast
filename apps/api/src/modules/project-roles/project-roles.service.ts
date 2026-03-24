import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectRoleDto } from './dto/create-project-role.dto';
import { UpdateProjectRoleDto } from './dto/update-project-role.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class ProjectRolesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly formatterInclude = {
    formatters: {
      include: {
        formatter: true,
      },
    },
  };

  async findAll(pagination: PaginationDto) {
    const { page = 1, pageSize = 20, search } = pagination;
    const skip = (page - 1) * pageSize;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [projectRoles, total] = await Promise.all([
      this.prisma.projectRole.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: this.formatterInclude,
      }),
      this.prisma.projectRole.count({ where }),
    ]);

    return {
      data: projectRoles,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const projectRole = await this.prisma.projectRole.findUnique({
      where: { id },
      include: this.formatterInclude,
    });

    if (!projectRole) {
      throw new NotFoundException('Project role not found');
    }

    return projectRole;
  }

  async findActive() {
    return this.prisma.projectRole.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: this.formatterInclude,
    });
  }

  async create(createProjectRoleDto: CreateProjectRoleDto) {
    const { formatterIds, ...roleData } = createProjectRoleDto;

    const existing = await this.prisma.projectRole.findUnique({
      where: { name: roleData.name },
    });

    if (existing) {
      throw new ConflictException('Project role with this name already exists');
    }

    return this.prisma.projectRole.create({
      data: {
        ...roleData,
        formatters: formatterIds?.length
          ? {
              create: formatterIds.map((formatterId) => ({ formatterId })),
            }
          : undefined,
      },
      include: this.formatterInclude,
    });
  }

  async update(id: string, updateProjectRoleDto: UpdateProjectRoleDto) {
    await this.findById(id);

    const { formatterIds, ...roleData } = updateProjectRoleDto;

    if (roleData.name) {
      const existing = await this.prisma.projectRole.findFirst({
        where: {
          name: roleData.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Project role with this name already exists');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Update formatter relations if provided
      if (formatterIds !== undefined) {
        await tx.projectRoleFormatter.deleteMany({
          where: { projectRoleId: id },
        });
        if (formatterIds.length > 0) {
          await tx.projectRoleFormatter.createMany({
            data: formatterIds.map((formatterId) => ({
              projectRoleId: id,
              formatterId,
            })),
          });
        }
      }

      return tx.projectRole.update({
        where: { id },
        data: roleData,
        include: this.formatterInclude,
      });
    });
  }

  async remove(id: string) {
    await this.findById(id);

    await this.prisma.projectRole.delete({
      where: { id },
    });
  }
}
