import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLog } from '@ghostcast/database';
import { AuditEventContext } from '@ghostcast/shared';

export const AUDIT_EVENT = 'audit.created';

export interface AuditEventPayload {
  auditLog: AuditLog;
  context: AuditEventContext;
}

@Injectable()
export class AuditEventEmitter {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit(auditLog: AuditLog, context: AuditEventContext): void {
    const payload: AuditEventPayload = { auditLog, context };
    this.eventEmitter.emit(AUDIT_EVENT, payload);
  }
}
