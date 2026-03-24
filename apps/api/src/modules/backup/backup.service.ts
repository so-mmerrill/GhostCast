import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import {
  BackupType,
  BackupStatus,
  BackupRecordCounts,
  BackupFileContents,
  BackupDataPayload,
  BackupScheduleConfig,
  RestoreResult,
} from '@ghostcast/shared';
import { Prisma } from '@ghostcast/database';

class DryRunRollbackError extends Error {
  constructor() {
    super('Dry run rollback');
    this.name = 'DryRunRollbackError';
  }
}

const DEFAULT_SCHEDULE_CONFIG: BackupScheduleConfig = {
  enabled: false,
  incrementalBackupIntervalMinutes: 0,
  retentionMonths: 12,
  maxBackups: 100,
};

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private backupDirectory: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.backupDirectory =
      this.configService.get<string>('backup.directory') ||
      path.join(process.cwd(), 'backups');
  }

  onModuleInit() {
    this.ensureBackupDirectory();
  }

  private ensureBackupDirectory(): void {
    if (!fs.existsSync(this.backupDirectory)) {
      fs.mkdirSync(this.backupDirectory, { recursive: true });
      this.logger.log(`Created backup directory: ${this.backupDirectory}`);
    }
  }

  // ===========================================
  // CRUD Operations
  // ===========================================

  async listBackups(options?: {
    type?: BackupType;
    status?: BackupStatus;
    backupMonth?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { type, status, backupMonth, page = 1, pageSize = 20 } = options || {};

    const where: Prisma.ScheduleBackupWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (backupMonth) where.backupMonth = backupMonth;

    const [data, total] = await Promise.all([
      this.prisma.scheduleBackup.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.scheduleBackup.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getBackup(id: string) {
    const backup = await this.prisma.scheduleBackup.findUnique({
      where: { id },
      include: {
        childBackups: {
          select: { id: true, type: true, createdAt: true, status: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!backup) {
      throw new NotFoundException(`Backup '${id}' not found`);
    }

    return backup;
  }

  async deleteBackup(id: string) {
    const backup = await this.prisma.scheduleBackup.findUnique({
      where: { id },
    });

    if (!backup) {
      throw new NotFoundException(`Backup '${id}' not found`);
    }

    // Delete JSON file from disk
    const fullPath = path.join(this.backupDirectory, backup.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      this.logger.log(`Deleted backup file: ${fullPath}`);
    }

    // Delete metadata from database
    await this.prisma.scheduleBackup.delete({ where: { id } });

    return { deleted: true };
  }

  // ===========================================
  // Backup Creation
  // ===========================================

  async createBackup(
    type: BackupType,
    triggeredBy?: string,
    label?: string,
    description?: string,
  ) {
    if (type === BackupType.FULL) {
      return this.createFullBackup(triggeredBy, label, description);
    }
    return this.createIncrementalBackup(triggeredBy, label, description);
  }

  private async createFullBackup(
    triggeredBy?: string,
    label?: string,
    description?: string,
  ) {
    const now = new Date();
    const backupMonth = this.formatMonth(now);
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const fileName = `${backupMonth}_full_${timestamp}.json`;

    // Create pending record
    const backup = await this.prisma.scheduleBackup.create({
      data: {
        type: BackupType.FULL,
        status: BackupStatus.IN_PROGRESS,
        label: label || `${this.formatMonthLabel(now)} Full Backup`,
        description,
        snapshotTimestamp: now,
        backupMonth,
        filePath: fileName,
        recordCounts: {},
        triggeredBy: triggeredBy || null,
        isAutomatic: !triggeredBy,
      },
    });

    try {
      // Snapshot all entity types in a read transaction
      const data = await this.prisma.$transaction(async (tx) => {
        return this.snapshotAllEntities(tx);
      });

      const recordCounts = this.countRecords(data);
      const fileContents: BackupFileContents = {
        version: 1,
        type: BackupType.FULL,
        backupId: backup.id,
        backupMonth,
        snapshotTimestamp: now.toISOString(),
        parentBackupId: null,
        recordCounts,
        data,
      };

      // Write JSON file
      const fullPath = path.join(this.backupDirectory, fileName);
      const jsonStr = JSON.stringify(fileContents, null, 2);
      fs.writeFileSync(fullPath, jsonStr, 'utf-8');

      // Update backup record
      const updated = await this.prisma.scheduleBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.COMPLETED,
          recordCounts: recordCounts as unknown as Prisma.InputJsonValue,
          fileSizeBytes: Buffer.byteLength(jsonStr, 'utf-8'),
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `Full backup completed: ${fileName} (${recordCounts.assignments} assignments, ${recordCounts.requests} requests)`,
      );

      return updated;
    } catch (error) {
      await this.prisma.scheduleBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private async createIncrementalBackup(
    triggeredBy?: string,
    label?: string,
    description?: string,
  ) {
    // Find most recent completed backup as parent
    const parentBackup = await this.prisma.scheduleBackup.findFirst({
      where: { status: BackupStatus.COMPLETED },
      orderBy: { snapshotTimestamp: 'desc' },
    });

    if (!parentBackup) {
      this.logger.warn(
        'No completed parent backup found, creating full backup instead',
      );
      return this.createFullBackup(triggeredBy, label || 'Auto Full Backup (no parent)', description);
    }

    const now = new Date();
    const backupMonth = this.formatMonth(now);
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const fileName = `${backupMonth}_incremental_${timestamp}.json`;

    const backup = await this.prisma.scheduleBackup.create({
      data: {
        type: BackupType.INCREMENTAL,
        status: BackupStatus.IN_PROGRESS,
        label: label || `${this.formatMonthLabel(now)} Incremental`,
        description,
        parentBackupId: parentBackup.id,
        snapshotTimestamp: now,
        backupMonth,
        filePath: fileName,
        recordCounts: {},
        triggeredBy: triggeredBy || null,
        isAutomatic: !triggeredBy,
      },
    });

    try {
      const parentTimestamp = parentBackup.snapshotTimestamp;

      const data = await this.prisma.$transaction(async (tx) => {
        return this.snapshotDelta(tx, parentTimestamp);
      });

      const recordCounts = this.countRecords(data);
      const fileContents: BackupFileContents = {
        version: 1,
        type: BackupType.INCREMENTAL,
        backupId: backup.id,
        backupMonth,
        snapshotTimestamp: now.toISOString(),
        parentBackupId: parentBackup.id,
        recordCounts,
        data,
      };

      const fullPath = path.join(this.backupDirectory, fileName);
      const jsonStr = JSON.stringify(fileContents, null, 2);
      fs.writeFileSync(fullPath, jsonStr, 'utf-8');

      const updated = await this.prisma.scheduleBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.COMPLETED,
          recordCounts: recordCounts as unknown as Prisma.InputJsonValue,
          fileSizeBytes: Buffer.byteLength(jsonStr, 'utf-8'),
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `Incremental backup completed: ${fileName} (parent: ${parentBackup.id})`,
      );

      return updated;
    } catch (error) {
      await this.prisma.scheduleBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  // ===========================================
  // Monthly Backup Check (called by scheduler)
  // ===========================================

  async checkAndRunMonthlyBackup(): Promise<void> {
    // Determine previous month
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = this.formatMonth(prevMonth);
    const monthStart = new Date(
      prevMonth.getFullYear(),
      prevMonth.getMonth(),
      1,
    );
    const monthEnd = new Date(
      prevMonth.getFullYear(),
      prevMonth.getMonth() + 1,
      1,
    );

    // Check if full backup already exists for previous month
    const existing = await this.prisma.scheduleBackup.findFirst({
      where: {
        type: BackupType.FULL,
        status: BackupStatus.COMPLETED,
        backupMonth: prevMonthStr,
      },
    });

    if (existing) {
      this.logger.debug(
        `Full backup for ${prevMonthStr} already exists, skipping`,
      );
      return;
    }

    // Check if there were new assignments in that month
    const assignmentCount = await this.prisma.assignment.count({
      where: {
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    });

    if (assignmentCount === 0) {
      this.logger.debug(
        `No new assignments in ${prevMonthStr}, skipping monthly backup`,
      );
      return;
    }

    this.logger.log(
      `Running monthly backup for ${prevMonthStr} (${assignmentCount} new assignments)`,
    );

    await this.createFullBackup(
      undefined,
      `${this.formatMonthLabel(prevMonth)} Full Backup`,
    );
  }

  // ===========================================
  // Restore
  // ===========================================

  async restoreFromBackup(
    backupId: string,
    dryRun = false,
  ): Promise<RestoreResult> {
    const backup = await this.prisma.scheduleBackup.findUnique({
      where: { id: backupId },
    });

    if (!backup) {
      throw new NotFoundException(`Backup '${backupId}' not found`);
    }

    if (backup.status !== BackupStatus.COMPLETED) {
      throw new Error(`Cannot restore from backup with status '${backup.status}'`);
    }

    // Resolve the full data to restore
    const mergedData = await this.resolveBackupData(backup);

    const recordCounts = this.countRecords(mergedData);
    const errors: string[] = [];

    try {
      await this.prisma.$transaction(async (tx) => {
        // Delete all schedule data in dependency order
        await tx.assignmentMember.deleteMany();
        await tx.assignmentSkill.deleteMany();
        await tx.assignmentFormatter.deleteMany();
        await tx.assignmentProjectRole.deleteMany();
        await tx.requestMember.deleteMany();
        await tx.requestSkill.deleteMany();
        await tx.assignment.deleteMany();
        await tx.request.deleteMany();

        // Re-create from backup data
        if (mergedData.requests.length > 0) {
          await tx.request.createMany({
            data: mergedData.requests as any[],
          });
        }

        if (mergedData.assignments.length > 0) {
          await tx.assignment.createMany({
            data: mergedData.assignments as any[],
          });
        }

        // Re-create junction tables
        if (mergedData.assignmentMembers.length > 0) {
          await tx.assignmentMember.createMany({
            data: mergedData.assignmentMembers as any[],
          });
        }

        if (mergedData.assignmentSkills.length > 0) {
          await tx.assignmentSkill.createMany({
            data: mergedData.assignmentSkills as any[],
          });
        }

        if (mergedData.assignmentFormatters.length > 0) {
          await tx.assignmentFormatter.createMany({
            data: mergedData.assignmentFormatters as any[],
          });
        }

        if (mergedData.assignmentProjectRoles.length > 0) {
          await tx.assignmentProjectRole.createMany({
            data: mergedData.assignmentProjectRoles as any[],
          });
        }

        if (mergedData.requestMembers.length > 0) {
          await tx.requestMember.createMany({
            data: mergedData.requestMembers as any[],
          });
        }

        if (mergedData.requestSkills.length > 0) {
          await tx.requestSkill.createMany({
            data: mergedData.requestSkills as any[],
          });
        }

        if (dryRun) {
          throw new DryRunRollbackError();
        }
      });
    } catch (error) {
      if (error instanceof DryRunRollbackError) {
        this.logger.log(`Dry-run restore completed for backup ${backupId}`);
        return {
          success: true,
          dryRun: true,
          backupId,
          recordCounts,
          errors,
        };
      }
      throw error;
    }

    this.logger.log(`Restore completed from backup ${backupId}`);

    return {
      success: true,
      dryRun: false,
      backupId,
      restoredAt: new Date().toISOString(),
      recordCounts,
      errors,
    };
  }

  // ===========================================
  // Backup Chain Resolution
  // ===========================================

  private async resolveBackupData(
    backup: { id: string; type: string; parentBackupId: string | null; filePath: string },
  ): Promise<BackupDataPayload> {
    const fileContents = this.readBackupFile(backup.filePath);

    if (backup.type === BackupType.FULL) {
      return fileContents.data;
    }

    // Incremental: walk chain back to nearest FULL
    const chain = await this.buildBackupChain(backup.id);

    // Start with the FULL backup data (chain always starts with FULL)
    const fullBackup = chain[0]!;
    const fullContents = this.readBackupFile(fullBackup.filePath);
    let merged = fullContents.data;

    // Apply each incremental delta in order
    for (let i = 1; i < chain.length; i++) {
      const incrContents = this.readBackupFile(chain[i]!.filePath);
      merged = this.applyDelta(merged, incrContents.data);
    }

    return merged;
  }

  private async buildBackupChain(
    backupId: string,
  ): Promise<{ id: string; type: string; filePath: string }[]> {
    type ChainEntry = { id: string; type: string; filePath: string; parentBackupId: string | null };
    const chain: ChainEntry[] = [];
    let currentId: string | null = backupId;

    while (currentId) {
      const found: ChainEntry | null = await this.prisma.scheduleBackup.findUnique({
        where: { id: currentId },
        select: { id: true, type: true, filePath: true, parentBackupId: true },
      });

      if (!found) {
        throw new Error(`Backup chain broken: backup '${currentId}' not found`);
      }

      chain.unshift(found);

      if (found.type === BackupType.FULL) {
        break;
      }

      currentId = found.parentBackupId;
    }

    if (chain.length === 0 || chain[0]!.type !== BackupType.FULL) {
      throw new Error('Backup chain does not start with a FULL backup');
    }

    return chain;
  }

  private applyDelta(
    base: BackupDataPayload,
    delta: BackupDataPayload,
  ): BackupDataPayload {
    const entityTypes = [
      'requests',
      'assignments',
      'assignmentMembers',
      'assignmentSkills',
      'assignmentFormatters',
      'assignmentProjectRoles',
      'requestMembers',
      'requestSkills',
    ] as const;

    const result: BackupDataPayload = { ...base };

    for (const entityType of entityTypes) {
      const baseRecords = (base[entityType] || []) as Record<string, unknown>[];
      const deltaRecords = (delta[entityType] || []) as Record<string, unknown>[];
      const deletedIds = delta.deletedIds?.[entityType] || [];

      // Build a map of base records by ID
      const recordMap = new Map<string, Record<string, unknown>>();
      for (const record of baseRecords) {
        recordMap.set(record.id as string, record);
      }

      // Apply updates/creates from delta
      for (const record of deltaRecords) {
        recordMap.set(record.id as string, record);
      }

      // Remove deleted IDs
      for (const deletedId of deletedIds) {
        recordMap.delete(deletedId);
      }

      (result as any)[entityType] = Array.from(recordMap.values());
    }

    return result;
  }

  // ===========================================
  // Snapshot Helpers
  // ===========================================

  private async snapshotAllEntities(
    tx: Prisma.TransactionClient,
  ): Promise<BackupDataPayload> {
    const [
      requests,
      assignments,
      assignmentMembers,
      assignmentSkills,
      assignmentFormatters,
      assignmentProjectRoles,
      requestMembers,
      requestSkills,
    ] = await Promise.all([
      tx.request.findMany(),
      tx.assignment.findMany(),
      tx.assignmentMember.findMany(),
      tx.assignmentSkill.findMany(),
      tx.assignmentFormatter.findMany(),
      tx.assignmentProjectRole.findMany(),
      tx.requestMember.findMany(),
      tx.requestSkill.findMany(),
    ]);

    return {
      requests,
      assignments,
      assignmentMembers,
      assignmentSkills,
      assignmentFormatters,
      assignmentProjectRoles,
      requestMembers,
      requestSkills,
    };
  }

  private async snapshotDelta(
    tx: Prisma.TransactionClient,
    since: Date,
  ): Promise<BackupDataPayload> {
    // For entities with updatedAt, get records changed since parent
    const [requests, assignments] = await Promise.all([
      tx.request.findMany({ where: { updatedAt: { gt: since } } }),
      tx.assignment.findMany({ where: { updatedAt: { gt: since } } }),
    ]);

    // Junction tables don't have updatedAt — snapshot all of them
    // and compute deltas by comparing with parent during restore
    const [
      assignmentMembers,
      assignmentSkills,
      assignmentFormatters,
      assignmentProjectRoles,
      requestMembers,
      requestSkills,
    ] = await Promise.all([
      tx.assignmentMember.findMany(),
      tx.assignmentSkill.findMany(),
      tx.assignmentFormatter.findMany(),
      tx.assignmentProjectRole.findMany(),
      tx.requestMember.findMany(),
      tx.requestSkill.findMany(),
    ]);

    // Read parent backup to compute deleted IDs
    const parentData = await this.getParentFullSnapshot(tx);
    const deletedIds = parentData
      ? {
          requests: this.findDeletedIds(
            parentData.requests as Record<string, unknown>[],
            await tx.request.findMany({ select: { id: true } }),
          ),
          assignments: this.findDeletedIds(
            parentData.assignments as Record<string, unknown>[],
            await tx.assignment.findMany({ select: { id: true } }),
          ),
          assignmentMembers: [] as string[],
          assignmentSkills: [] as string[],
          assignmentFormatters: [] as string[],
          assignmentProjectRoles: [] as string[],
          requestMembers: [] as string[],
          requestSkills: [] as string[],
        }
      : undefined;

    return {
      requests,
      assignments,
      assignmentMembers,
      assignmentSkills,
      assignmentFormatters,
      assignmentProjectRoles,
      requestMembers,
      requestSkills,
      deletedIds,
    };
  }

  private async getParentFullSnapshot(
    _tx: Prisma.TransactionClient,
  ): Promise<BackupDataPayload | null> {
    const parentBackup = await this.prisma.scheduleBackup.findFirst({
      where: { type: BackupType.FULL, status: BackupStatus.COMPLETED },
      orderBy: { snapshotTimestamp: 'desc' },
    });

    if (!parentBackup) return null;

    try {
      const contents = this.readBackupFile(parentBackup.filePath);
      return contents.data;
    } catch {
      return null;
    }
  }

  private findDeletedIds(
    parentRecords: Record<string, unknown>[],
    currentRecords: { id: string }[],
  ): string[] {
    const currentIds = new Set(currentRecords.map((r) => r.id));
    return parentRecords
      .map((r) => r.id as string)
      .filter((id) => !currentIds.has(id));
  }

  // ===========================================
  // File I/O
  // ===========================================

  private readBackupFile(filePath: string): BackupFileContents {
    const fullPath = path.join(this.backupDirectory, filePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`Backup file not found: ${filePath}`);
    }
    const raw = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as BackupFileContents;
  }

  // ===========================================
  // Schedule Config
  // ===========================================

  async getScheduleConfig(): Promise<BackupScheduleConfig> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'backup-schedule' },
    });

    if (!config) {
      return DEFAULT_SCHEDULE_CONFIG;
    }

    return config.value as unknown as BackupScheduleConfig;
  }

  async updateScheduleConfig(
    config: BackupScheduleConfig,
  ): Promise<BackupScheduleConfig> {
    await this.prisma.systemConfig.upsert({
      where: { key: 'backup-schedule' },
      create: {
        key: 'backup-schedule',
        value: config as unknown as Prisma.InputJsonValue,
        category: 'backup',
      },
      update: {
        value: config as unknown as Prisma.InputJsonValue,
      },
    });

    return config;
  }

  // ===========================================
  // Cleanup
  // ===========================================

  async cleanupOldBackups(): Promise<void> {
    const config = await this.getScheduleConfig();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - config.retentionMonths);

    // Delete backups older than retention period
    const oldBackups = await this.prisma.scheduleBackup.findMany({
      where: { createdAt: { lt: cutoffDate } },
      orderBy: { createdAt: 'asc' },
    });

    for (const backup of oldBackups) {
      try {
        await this.deleteBackup(backup.id);
        this.logger.log(`Cleaned up old backup: ${backup.filePath}`);
      } catch (error) {
        this.logger.error(
          `Failed to clean up backup ${backup.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Enforce max backups limit
    const totalCount = await this.prisma.scheduleBackup.count();
    if (totalCount > config.maxBackups) {
      const excess = await this.prisma.scheduleBackup.findMany({
        orderBy: { createdAt: 'asc' },
        take: totalCount - config.maxBackups,
      });

      for (const backup of excess) {
        try {
          await this.deleteBackup(backup.id);
          this.logger.log(`Cleaned up excess backup: ${backup.filePath}`);
        } catch (error) {
          this.logger.error(
            `Failed to clean up excess backup ${backup.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  // ===========================================
  // Utilities
  // ===========================================

  private formatMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private formatMonthLabel(date: Date): string {
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  private countRecords(data: BackupDataPayload): BackupRecordCounts {
    return {
      requests: data.requests.length,
      assignments: data.assignments.length,
      assignmentMembers: data.assignmentMembers.length,
      assignmentSkills: data.assignmentSkills.length,
      assignmentFormatters: data.assignmentFormatters.length,
      assignmentProjectRoles: data.assignmentProjectRoles.length,
      requestMembers: data.requestMembers.length,
      requestSkills: data.requestSkills.length,
    };
  }
}
