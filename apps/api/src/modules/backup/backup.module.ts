import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';

@Module({
  imports: [DatabaseModule],
  controllers: [BackupController],
  providers: [BackupService, BackupSchedulerService],
  exports: [BackupService],
})
export class BackupModule {}
