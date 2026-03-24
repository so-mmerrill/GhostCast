import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { User, Prisma } from '@ghostcast/database';
import { PasswordPolicy } from '@ghostcast/shared';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import {
  DEFAULT_PASSWORD_POLICY,
  validatePasswordComplexity,
} from '../../common/utils/password-validation';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  jti: string; // JWT ID for uniqueness
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash || !user.isActive) {
      return null;
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(user: User) {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: uuidv4(),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = uuidv4();

    // Update lastLogin timestamp and store refresh token in database
    await Promise.all([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      }),
      this.prisma.session.create({
        data: {
          userId: user.id,
          token: accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      }),
    ]);

    // Return user without sensitive data
    const { passwordHash, ...safeUser } = user as typeof user & { passwordHash?: string };

    return {
      accessToken,
      refreshToken,
      user: safeUser,
    };
  }

  async refreshTokens(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException('User account is disabled');
    }

    // Generate new tokens
    const payload: TokenPayload = {
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      jti: uuidv4(),
    };

    const newAccessToken = this.jwtService.sign(payload);
    const newRefreshToken = uuidv4();

    // Update session with new tokens using optimistic locking
    // Include refreshToken in WHERE to prevent race conditions
    const result = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        refreshToken: refreshToken, // Ensure token hasn't been used already
      },
      data: {
        token: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // If no rows updated, the refresh token was already used (race condition)
    if (result.count === 0) {
      throw new UnauthorizedException('Refresh token already used');
    }

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: string, refreshToken: string) {
    await this.prisma.session.deleteMany({
      where: {
        userId,
        refreshToken,
      },
    });
  }

  async logoutAll(userId: string) {
    await this.prisma.session.deleteMany({
      where: { userId },
    });
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { passwordHash, ...safeUser } = user as typeof user & { passwordHash?: string };
    return safeUser;
  }

  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      avatar?: string | null;
      preferences?: Record<string, unknown>;
    }
  ) {
    const { preferences, ...rest } = data;
    const updateData: Prisma.UserUpdateInput = {
      ...rest,
      // Only include preferences if explicitly provided
      ...(preferences !== undefined && {
        preferences: preferences as Prisma.InputJsonValue,
      }),
    };

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    const { passwordHash, ...safeUser } = user as typeof user & { passwordHash?: string };
    return safeUser;
  }

  async validateToken(token: string): Promise<User | null> {
    try {
      this.jwtService.verify<TokenPayload>(token);

      const session = await this.prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!session?.user.isActive) {
        return null;
      }

      return session.user;
    } catch {
      return null;
    }
  }

  async getPasswordPolicy(): Promise<PasswordPolicy> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'password.complexity' },
    });

    if (!config) {
      return DEFAULT_PASSWORD_POLICY;
    }

    return { ...DEFAULT_PASSWORD_POLICY, ...(config.value as object) };
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async validateOrProvisionSamlUser(samlProfile: {
    email: string;
    firstName: string;
    lastName: string;
    ssoSubject: string;
  }): Promise<User> {
    const email = samlProfile.email.toLowerCase();

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('User account is disabled');
      }

      // Link existing user to SAML if not already linked
      if (user.ssoProvider !== 'saml' || user.ssoSubject !== samlProfile.ssoSubject) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            ssoProvider: 'saml',
            ssoSubject: samlProfile.ssoSubject,
          },
        });
      }

      return user;
    }

    // Auto-provision new SSO-only user
    return this.prisma.user.create({
      data: {
        email,
        firstName: samlProfile.firstName,
        lastName: samlProfile.lastName,
        passwordHash: null,
        ssoProvider: 'saml',
        ssoSubject: samlProfile.ssoSubject,
        role: 'UNASSIGNED',
      },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionToken?: string
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(
        'Cannot change password for SSO-only users'
      );
    }

    const isCurrentPasswordValid = await argon2.verify(
      user.passwordHash,
      currentPassword
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Validate against password complexity policy
    const policy = await this.getPasswordPolicy();
    const { valid, errors } = validatePasswordComplexity(newPassword, policy);
    if (!valid) {
      throw new BadRequestException(errors);
    }

    const newPasswordHash = await argon2.hash(newPassword);

    // Update password and lastPasswordChange timestamp
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        lastPasswordChange: new Date(),
        mustResetPassword: false,
      },
    });

    // Invalidate all other sessions for security (keep current session)
    if (currentSessionToken) {
      await this.prisma.session.deleteMany({
        where: {
          userId,
          token: { not: currentSessionToken },
        },
      });
    } else {
      // If no current session token provided, invalidate all sessions
      await this.prisma.session.deleteMany({
        where: { userId },
      });
    }
  }
}
