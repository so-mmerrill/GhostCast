import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class PasswordResetGuard implements CanActivate {
  private static readonly ALLOWED_ROUTES = [
    { method: 'PUT', path: '/api/auth/password' },
    { method: 'POST', path: '/api/auth/logout' },
    { method: 'GET', path: '/api/auth/me' },
  ];

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip public routes (login, refresh, etc.)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { mustResetPassword?: boolean } | undefined;

    // No user or flag not set — allow through
    if (!user?.mustResetPassword) {
      return true;
    }

    // Check if the request matches an allowed route
    const isAllowed = PasswordResetGuard.ALLOWED_ROUTES.some(
      (route) =>
        request.method === route.method && request.path === route.path,
    );

    if (isAllowed) {
      return true;
    }

    throw new ForbiddenException({
      error: 'PASSWORD_RESET_REQUIRED',
      message: 'You must reset your password before continuing.',
    });
  }
}
