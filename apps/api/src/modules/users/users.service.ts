import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@ghostcast/database';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  DEFAULT_PASSWORD_POLICY,
  validatePasswordComplexity,
} from '../../common/utils/password-validation';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(pagination: PaginationDto) {
    const { page = 1, pageSize = 20, search } = pagination;
    const skip = (page - 1) * pageSize;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          department: true,
          role: true,
          isActive: true,
          mustResetPassword: true,
          ssoProvider: true,
          preferences: true,
          lastLogin: true,
          lastPasswordChange: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        department: true,
        role: true,
        isActive: true,
        mustResetPassword: true,
        ssoProvider: true,
        preferences: true,
        lastLogin: true,
        lastPasswordChange: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.preferences = (await this.ensureLinkedMember(user)) as typeof user.preferences;

    return user;
  }

  /**
   * Auto-populate `preferences.scheduleFilter.linkedMemberId` by matching
   * User.email against an active Member.email when not yet set. Idempotent.
   */
  private async ensureLinkedMember(user: {
    id: string;
    email: string;
    preferences: unknown;
  }): Promise<Record<string, unknown>> {
    const prefs = (user.preferences as Record<string, unknown> | null) ?? {};
    const filter = (prefs.scheduleFilter as Record<string, unknown> | undefined) ?? {};
    if (filter.linkedMemberId) return prefs;

    const member = await this.prisma.member.findFirst({
      where: { email: user.email, isActive: true },
      select: { id: true },
    });
    if (!member) return prefs;

    const updated = {
      ...prefs,
      scheduleFilter: { ...filter, linkedMemberId: member.id },
    };
    await this.prisma.user.update({
      where: { id: user.id },
      data: { preferences: updated },
    });
    return updated;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.findByEmail(createUserDto.email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    let passwordHash: string | null = null;
    if (createUserDto.password) {
      const policy = await this.getPasswordPolicy();
      const { valid, errors } = validatePasswordComplexity(createUserDto.password, policy);
      if (!valid) {
        throw new BadRequestException(errors);
      }
      passwordHash = await argon2.hash(createUserDto.password);
    }

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        passwordHash,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        role: createUserDto.role,
        department: createUserDto.department || null,
        mustResetPassword: createUserDto.mustResetPassword,
        ...(createUserDto.preferences !== undefined && {
          preferences: createUserDto.preferences as Prisma.InputJsonValue,
        }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        department: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findById(id); // Ensure user exists

    const data: Record<string, unknown> = { ...updateUserDto };

    // Treat empty-string department as a clear (NULL) so the dropdown's "None" choice persists.
    if (data.department === '') {
      data.department = null;
    }

    // Handle password separately - hash if provided, always remove from data
    if (updateUserDto.password) {
      const policy = await this.getPasswordPolicy();
      const { valid, errors } = validatePasswordComplexity(updateUserDto.password, policy);
      if (!valid) {
        throw new BadRequestException(errors);
      }
      data.passwordHash = await argon2.hash(updateUserDto.password);
    }
    delete data.password;

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        department: true,
        role: true,
        isActive: true,
        mustResetPassword: true,
        preferences: true,
        updatedAt: true,
      },
    });

    return user;
  }

  private async getPasswordPolicy() {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'password.complexity' },
    });

    if (!config) {
      return DEFAULT_PASSWORD_POLICY;
    }

    return { ...DEFAULT_PASSWORD_POLICY, ...(config.value as object) };
  }

  async remove(id: string) {
    await this.findById(id); // Ensure user exists

    await this.prisma.user.delete({
      where: { id },
    });
  }
}
