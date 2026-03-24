import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BackupService } from './backup.service';
import { BackupType } from '@ghostcast/shared';

const INTERVAL_MONTHLY_CHECK = 'backup-monthly-check';
const INTERVAL_INCREMENTAL = 'backup-incremental';
const INTERVAL_CLEANUP = 'backup-cleanup';

// Daily check interval (24 hours in ms)
const DAILY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BackupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly backupService: BackupService,
  ) {}

  async onModuleInit() {
    await this.updateSchedule();
  }

  onModuleDestroy() {
    this.stopAllSchedules();
  }

  async updateSchedule(): Promise<void> {
    this.stopAllSchedules();

    const config = await this.backupService.getScheduleConfig();

    if (!config?.enabled) {
      this.logger.debug('Backup scheduling disabled');
      return;
    }

    // Register daily check for monthly full backup
    const monthlyCallback = async () => {
      this.logger.log('Running monthly backup check');
      try {
        await this.backupService.checkAndRunMonthlyBackup();
      } catch (error) {
        this.logger.error(
          `Monthly backup check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const monthlyInterval = setInterval(monthlyCallback, DAILY_MS);
    this.schedulerRegistry.addInterval(INTERVAL_MONTHLY_CHECK, monthlyInterval);
    this.logger.log('Scheduled daily monthly backup check');

    // Register incremental backup interval
    if (config.incrementalBackupIntervalMinutes > 0) {
      const incrementalMs =
        config.incrementalBackupIntervalMinutes * 60 * 1000;
      const incrementalCallback = async () => {
        this.logger.log('Running scheduled incremental backup');
        try {
          await this.backupService.createBackup(BackupType.INCREMENTAL);
        } catch (error) {
          this.logger.error(
            `Scheduled incremental backup failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      };
      const incrementalInterval = setInterval(
        incrementalCallback,
        incrementalMs,
      );
      this.schedulerRegistry.addInterval(
        INTERVAL_INCREMENTAL,
        incrementalInterval,
      );
      this.logger.log(
        `Scheduled incremental backup every ${config.incrementalBackupIntervalMinutes} minute(s)`,
      );
    } else {
      this.logger.debug('Incremental backup scheduling disabled (interval is 0)');
    }

    // Register daily cleanup
    const cleanupCallback = async () => {
      this.logger.log('Running backup cleanup');
      try {
        await this.backupService.cleanupOldBackups();
      } catch (error) {
        this.logger.error(
          `Backup cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const cleanupInterval = setInterval(cleanupCallback, DAILY_MS);
    this.schedulerRegistry.addInterval(INTERVAL_CLEANUP, cleanupInterval);
    this.logger.log('Scheduled daily backup cleanup');
  }

  private stopAllSchedules(): void {
    for (const name of [
      INTERVAL_MONTHLY_CHECK,
      INTERVAL_INCREMENTAL,
      INTERVAL_CLEANUP,
    ]) {
      this.stopInterval(name);
    }
  }

  private stopInterval(name: string): void {
    try {
      if (this.schedulerRegistry.doesExist('interval', name)) {
        this.schedulerRegistry.deleteInterval(name);
        this.logger.debug(`Stopped scheduled interval: ${name}`);
      }
    } catch {
      // Interval doesn't exist, ignore
    }
  }
}
