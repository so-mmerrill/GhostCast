import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateFormatterDto } from './dto/create-formatter.dto';
import { UpdateFormatterDto } from './dto/update-formatter.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

// Include for project role relations
const projectRoleInclude = {
  projectRoles: {
    include: {
      projectRole: true,
    },
  },
};

@Injectable()
export class FormattersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto) {
    const { page = 1, pageSize = 50, search } = pagination;
    const skip = (page - 1) * pageSize;

    const where = search
      ? {
          name: { contains: search, mode: 'insensitive' as const },
        }
      : {};

    const [formatters, total] = await Promise.all([
      this.prisma.formatter.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: projectRoleInclude,
      }),
      this.prisma.formatter.count({ where }),
    ]);

    return {
      data: formatters,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const formatter = await this.prisma.formatter.findUnique({
      where: { id },
      include: projectRoleInclude,
    });

    if (!formatter) {
      throw new NotFoundException('Formatter not found');
    }

    return formatter;
  }

  async findActive() {
    return this.prisma.formatter.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: projectRoleInclude,
    });
  }

  async create(createFormatterDto: CreateFormatterDto) {
    const { projectRoleIds, ...formatterData } = createFormatterDto;

    const existing = await this.prisma.formatter.findUnique({
      where: { name: formatterData.name },
    });

    if (existing) {
      throw new ConflictException('Formatter with this name already exists');
    }

    return this.prisma.formatter.create({
      data: {
        ...formatterData,
        projectRoles:
          projectRoleIds && projectRoleIds.length > 0
            ? {
                create: projectRoleIds.map((projectRoleId) => ({
                  projectRole: { connect: { id: projectRoleId } },
                })),
              }
            : undefined,
      },
      include: projectRoleInclude,
    });
  }

  async update(id: string, updateFormatterDto: UpdateFormatterDto) {
    await this.findById(id);

    const { projectRoleIds, ...formatterData } = updateFormatterDto;

    if (formatterData.name) {
      const existing = await this.prisma.formatter.findFirst({
        where: {
          name: formatterData.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Formatter with this name already exists');
      }
    }

    // Use transaction if projectRoleIds are provided
    if (projectRoleIds !== undefined) {
      return this.prisma.$transaction(async (tx) => {
        // Delete existing project role associations
        await tx.projectRoleFormatter.deleteMany({
          where: { formatterId: id },
        });

        // Update formatter with new data and create new associations
        return tx.formatter.update({
          where: { id },
          data: {
            ...formatterData,
            projectRoles:
              projectRoleIds.length > 0
                ? {
                    create: projectRoleIds.map((projectRoleId) => ({
                      projectRole: { connect: { id: projectRoleId } },
                    })),
                  }
                : undefined,
          },
          include: projectRoleInclude,
        });
      });
    }

    return this.prisma.formatter.update({
      where: { id },
      data: formatterData,
      include: projectRoleInclude,
    });
  }

  async remove(id: string) {
    await this.findById(id);

    // Deleting a formatter will cascade delete AssignmentFormatter entries
    await this.prisma.formatter.delete({
      where: { id },
    });
  }
}
