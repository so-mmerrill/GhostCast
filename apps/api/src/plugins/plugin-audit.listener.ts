import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PluginRegistry } from './plugin.registry';
import { PrismaService } from '../database/prisma.service';
import {
  AUDIT_EVENT,
  AuditEventPayload,
} from '../modules/audit/audit-event.emitter';
import { PluginType, AuditLog } from '@ghostcast/shared';

@Injectable()
export class PluginAuditListener {
  private readonly logger = new Logger(PluginAuditListener.name);

  constructor(
    private readonly registry: PluginRegistry,
    private readonly prisma: PrismaService
  ) {}

  @OnEvent(AUDIT_EVENT)
  async handleAuditEvent(payload: AuditEventPayload) {
    const { auditLog, context } = payload;

    try {
      // Get enabled extensions from database
      const enabledExtensions = await this.prisma.plugin.findMany({
        where: {
          isEnabled: true,
          type: PluginType.EXTENSION as unknown as import('@ghostcast/database').PluginType,
        },
      });

      if (enabledExtensions.length === 0) {
        return;
      }

      this.logger.debug(
        `Dispatching audit event (${auditLog.action} ${auditLog.entity}) to ${enabledExtensions.length} extension(s)`
      );

      // Dispatch to each enabled extension
      for (const extension of enabledExtensions) {
        const instance = this.registry.get(extension.name);
        const hooks = instance?.getHooks?.();

        if (hooks?.onAuditEvent) {
          try {
            await hooks.onAuditEvent({ auditLog: auditLog as AuditLog, context });
          } catch (error) {
            this.logger.error(
              `Extension "${extension.name}" failed to handle audit event: ${error}`
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to dispatch audit event to extensions`, error);
    }
  }
}
