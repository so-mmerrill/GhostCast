import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto) {
    const { page = 1, pageSize = 20, search } = pagination;
    const skip = (page - 1) * pageSize;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { category: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [skills, total] = await Promise.all([
      this.prisma.skill.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.skill.count({ where }),
    ]);

    return {
      data: skills,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    return skill;
  }

  async findActive() {
    return this.prisma.skill.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async create(createSkillDto: CreateSkillDto) {
    const existing = await this.prisma.skill.findUnique({
      where: { name: createSkillDto.name },
    });

    if (existing) {
      throw new ConflictException('Skill with this name already exists');
    }

    return this.prisma.skill.create({
      data: createSkillDto,
    });
  }

  async update(id: string, updateSkillDto: UpdateSkillDto) {
    await this.findById(id);

    if (updateSkillDto.name) {
      const existing = await this.prisma.skill.findFirst({
        where: {
          name: updateSkillDto.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Skill with this name already exists');
      }
    }

    return this.prisma.skill.update({
      where: { id },
      data: updateSkillDto,
    });
  }

  async remove(id: string) {
    await this.findById(id);

    await this.prisma.$transaction([
      this.prisma.requestSkill.deleteMany({ where: { skillId: id } }),
      this.prisma.assignmentSkill.deleteMany({ where: { skillId: id } }),
      this.prisma.skill.delete({ where: { id } }),
    ]);
  }
}
