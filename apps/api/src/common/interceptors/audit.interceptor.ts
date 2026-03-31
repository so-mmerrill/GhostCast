import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { from, Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { AuditEventEmitter } from '../../modules/audit/audit-event.emitter';
import { AUDIT_KEY, AuditOptions } from '../decorators/audit.decorator';
import { User } from '@ghostcast/database';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditEventEmitter: AuditEventEmitter
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;
    const method = request.method;

    // Only audit mutations by default
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    // Check for audit configuration
    const auditOptions = this.reflector.getAllAndOverride<AuditOptions>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()]
    );

    // Skip if no audit decorator or explicitly marked to skip
    if (!auditOptions || auditOptions.skip) {
      return next.handle();
    }

    const startTime = Date.now();
    const requestBody = request.body;
    const requestParams = request.params;

    // For DELETE and UPDATE operations, fetch entity before mutation to capture its previous state
    const preMutationPromise =
      ['DELETE', 'PUT', 'PATCH'].includes(method) && requestParams?.id
        ? this.fetchEntityBeforeMutation(
            auditOptions?.entity || this.getEntityFromPath(request.path),
            requestParams.id,
          )
        : Promise.resolve(null);

    return from(preMutationPromise).pipe(
      switchMap((preMutationEntity) => next.handle().pipe(
      tap({
        next: async (responseData) => {
          try {
            const action = auditOptions?.action || this.getActionFromMethod(method);
            const entity = auditOptions?.entity || this.getEntityFromPath(request.path);
            const entityId = requestParams?.id || (responseData as Record<string, unknown>)?.id;

            const entityName = this.extractEntityName(
              method === 'DELETE' ? preMutationEntity : responseData,
              entity,
            );

            const auditLog = await this.prisma.auditLog.create({
              data: {
                userId: user?.id,
                action,
                entity,
                entityId,
                oldValue: preMutationEntity
                  ? this.sanitizeData(preMutationEntity) as object
                  : undefined,
                newValue: this.sanitizeData(responseData) as object,
                ipAddress: this.getClientIp(request),
                userAgent: request.headers['user-agent'],
                metadata: {
                  method,
                  path: request.path,
                  duration: Date.now() - startTime,
                  requestBody: this.sanitizeData(requestBody) as object,
                  entityName,
                },
              },
            });

            // Emit audit event for extensions to consume
            this.auditEventEmitter.emit(auditLog, {
              requestId: uuidv4(),
              timestamp: new Date(),
              userId: user?.id,
              userRole: user?.role,
              userName: user ? `${user.firstName} ${user.lastName}` : undefined,
              metadata: { method, path: request.path },
            });
          } catch (error) {
            this.logger.error('Failed to create audit log', error);
          }
        },
        error: async (error) => {
          try {
            const action = auditOptions?.action || this.getActionFromMethod(method);
            const entity = auditOptions?.entity || this.getEntityFromPath(request.path);

            await this.prisma.auditLog.create({
              data: {
                userId: user?.id,
                action: `${action}_FAILED`,
                entity,
                entityId: requestParams?.id,
                ipAddress: this.getClientIp(request),
                userAgent: request.headers['user-agent'],
                metadata: {
                  method,
                  path: request.path,
                  duration: Date.now() - startTime,
                  error: error.message,
                } as object,
              },
            });
          } catch (auditError) {
            this.logger.error('Failed to create audit log for error', auditError);
          }
        },
      })
    )));
  }

  private async fetchEntityBeforeMutation(
    entity: string,
    entityId: string,
  ): Promise<Record<string, unknown> | null> {
    const modelMap: Record<string, string> = {
      User: 'user',
      Member: 'member',
      Assignment: 'assignment',
      ProjectType: 'projectType',
      ProjectRole: 'projectRole',
      Formatter: 'formatter',
      Skill: 'skill',
      Request: 'request',
    };

    const modelName = modelMap[entity];
    if (!modelName) return null;

    try {
      const model = (this.prisma as any)[modelName];
      if (!model) return null;

      // Include relations for entities that need them for notifications
      const includeMap: Record<string, object> = {
        Assignment: {
          members: { include: { member: { select: { firstName: true, lastName: true } } } },
        },
        Request: {
          requiredMembers: { include: { member: { select: { firstName: true, lastName: true } } } },
        },
      };

      const include = includeMap[entity];
      return await model.findUnique({
        where: { id: entityId },
        ...(include ? { include } : {}),
      });
    } catch {
      return null;
    }
  }

  private getActionFromMethod(method: string): string {
    const methodMap: Record<string, string> = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };
    return methodMap[method] || 'UNKNOWN';
  }

  private getEntityFromPath(path: string): string {
    // Extract entity from path like /api/users/123 -> User
    const parts = path.split('/').filter(Boolean);
    const entityPart = parts.find(
      (p) => p !== 'api' && !p.match(/^[a-z0-9-]+$/i)
    ) || parts[1];

    if (!entityPart) return 'Unknown';

    // Convert plural to singular and capitalize
    const singular = entityPart.replace(/s$/, '');
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  }

  private getClientIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }

  private extractEntityName(data: unknown, entity: string): string | null {
    if (!data || typeof data !== 'object') return null;

    const record = data as Record<string, unknown>;

    // Try common name fields in order of preference
    if (typeof record.name === 'string') return record.name;
    if (typeof record.title === 'string') return record.title;

    // For User/Member entities, combine first and last name
    if (typeof record.firstName === 'string' && typeof record.lastName === 'string') {
      return `${record.firstName} ${record.lastName}`;
    }

    // For email-based entities
    if (typeof record.email === 'string') return record.email;

    // Check nested data property (some responses wrap the entity)
    if (record.data && typeof record.data === 'object') {
      return this.extractEntityName(record.data, entity);
    }

    return null;
  }

  private sanitizeData(data: unknown): unknown {
    if (!data) return null;

    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
      'authorization',
    ];

    if (typeof data === 'object' && data !== null) {
      const sanitized = { ...data } as Record<string, unknown>;
      for (const field of sensitiveFields) {
        if (field in sanitized) {
          sanitized[field] = '[REDACTED]';
        }
      }
      return sanitized;
    }

    return data;
  }
}
