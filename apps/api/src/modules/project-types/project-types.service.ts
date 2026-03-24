import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@ghostcast/database';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectTypeDto } from './dto/create-project-type.dto';
import { UpdateProjectTypeDto } from './dto/update-project-type.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class ProjectTypesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const [projectTypes, total] = await Promise.all([
      this.prisma.projectType.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.projectType.count({ where }),
    ]);

    return {
      data: projectTypes,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const projectType = await this.prisma.projectType.findUnique({
      where: { id },
    });

    if (!projectType) {
      throw new NotFoundException('Project type not found');
    }

    return projectType;
  }

  async findActive() {
    return this.prisma.projectType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(createProjectTypeDto: CreateProjectTypeDto) {
    const existing = await this.prisma.projectType.findUnique({
      where: { name: createProjectTypeDto.name },
    });

    if (existing) {
      throw new ConflictException('Project type with this name already exists');
    }

    const { fieldConfig, ...rest } = createProjectTypeDto;
    return this.prisma.projectType.create({
      data: {
        ...rest,
        fieldConfig: fieldConfig as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async update(id: string, updateProjectTypeDto: UpdateProjectTypeDto) {
    await this.findById(id);

    if (updateProjectTypeDto.name) {
      const existing = await this.prisma.projectType.findFirst({
        where: {
          name: updateProjectTypeDto.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Project type with this name already exists');
      }
    }

    const { fieldConfig, ...rest } = updateProjectTypeDto;
    return this.prisma.projectType.update({
      where: { id },
      data: {
        ...rest,
        fieldConfig: fieldConfig === null
          ? Prisma.DbNull
          : (fieldConfig as Prisma.InputJsonValue | undefined),
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);

    // Check if project type is in use by assignments or requests
    const [assignmentsCount, requestsCount] = await Promise.all([
      this.prisma.assignment.count({
        where: { projectTypeId: id },
      }),
      this.prisma.request.count({
        where: { projectTypeId: id },
      }),
    ]);

    if (assignmentsCount > 0) {
      throw new ConflictException(
        `Cannot delete project type. It is used by ${assignmentsCount} assignment(s).`
      );
    }

    if (requestsCount > 0) {
      throw new ConflictException(
        `Cannot delete project type. It is used by ${requestsCount} request(s).`
      );
    }

    await this.prisma.projectType.delete({
      where: { id },
    });
  }
}
