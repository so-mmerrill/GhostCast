import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@ghostcast/shared';
import { SkipAudit } from '../../common/decorators/audit.decorator';

@Controller('audit-logs')
@Roles(Role.ADMIN)
@SkipAudit()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query);
  }

  @Get('entities')
  async getEntities() {
    return this.auditService.getDistinctEntities();
  }

  @Get('actions')
  async getActions() {
    return this.auditService.getDistinctActions();
  }
}
