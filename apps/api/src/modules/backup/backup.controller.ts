import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, BackupType, BackupStatus } from '@ghostcast/shared';
import { BackupService } from './backup.service';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { BackupScheduleConfigDto } from './dto/backup-schedule-config.dto';
import { BackupSchedulerService } from './backup-scheduler.service';

interface CurrentUserType {
  id: string;
  email: string;
  role: Role;
}

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('backups')
@Roles(Role.ADMIN)
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly backupSchedulerService: BackupSchedulerService,
  ) {}

  @Get()
  async listBackups(
    @Query('type') type?: BackupType,
    @Query('status') status?: BackupStatus,
    @Query('backupMonth') backupMonth?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.backupService.listBackups({
      type,
      status,
      backupMonth,
      page: page ? Number.parseInt(page, 10) : undefined,
      pageSize: pageSize ? Number.parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('schedule')
  async getScheduleConfig() {
    return this.backupService.getScheduleConfig();
  }

  @Get(':id')
  async getBackup(@Param('id') id: string) {
    return this.backupService.getBackup(id);
  }

  @Post()
  @Audit({ action: 'CREATE', entity: 'ScheduleBackup' })
  async createBackup(
    @Body() dto: CreateBackupDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.backupService.createBackup(
      dto.type,
      user.id,
      dto.label,
      dto.description,
    );
  }

  @Post(':id/restore')
  @Audit({ action: 'RESTORE', entity: 'ScheduleBackup' })
  async restoreBackup(
    @Param('id') id: string,
    @Body() dto: RestoreBackupDto,
  ) {
    return this.backupService.restoreFromBackup(id, dto.dryRun);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'DELETE', entity: 'ScheduleBackup' })
  async deleteBackup(@Param('id') id: string) {
    await this.backupService.deleteBackup(id);
  }

  @Put('schedule')
  @Audit({ action: 'UPDATE', entity: 'BackupScheduleConfig' })
  async updateScheduleConfig(@Body() dto: BackupScheduleConfigDto) {
    const config = await this.backupService.updateScheduleConfig(dto);
    await this.backupSchedulerService.updateSchedule();
    return config;
  }
}
