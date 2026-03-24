import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditEventEmitter } from './audit-event.emitter';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditEventEmitter, AuditInterceptor],
  exports: [AuditService, AuditEventEmitter, AuditInterceptor],
})
export class AuditModule {}
