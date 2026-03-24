// ===========================================
// Schedule Backup Types
// ===========================================

export enum BackupType {
  FULL = 'FULL',
  INCREMENTAL = 'INCREMENTAL',
}

export enum BackupStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type BackupEntityType =
  | 'requests'
  | 'assignments'
  | 'assignmentMembers'
  | 'assignmentSkills'
  | 'assignmentFormatters'
  | 'assignmentProjectRoles'
  | 'requestMembers'
  | 'requestSkills';

export interface BackupRecordCounts {
  requests: number;
  assignments: number;
  assignmentMembers: number;
  assignmentSkills: number;
  assignmentFormatters: number;
  assignmentProjectRoles: number;
  requestMembers: number;
  requestSkills: number;
}

// JSON dump file structure
export interface BackupFileContents {
  version: 1;
  type: BackupType;
  backupId: string;
  backupMonth: string; // "YYYY-MM"
  snapshotTimestamp: string; // ISO date
  parentBackupId?: string | null;
  recordCounts: BackupRecordCounts;
  data: BackupDataPayload;
}

// For FULL: all records. For INCREMENTAL: only deltas
export interface BackupDataPayload {
  requests: unknown[];
  assignments: unknown[];
  assignmentMembers: unknown[];
  assignmentSkills: unknown[];
  assignmentFormatters: unknown[];
  assignmentProjectRoles: unknown[];
  requestMembers: unknown[];
  requestSkills: unknown[];
  // Incremental-only: IDs deleted since parent
  deletedIds?: {
    requests?: string[];
    assignments?: string[];
    assignmentMembers?: string[];
    assignmentSkills?: string[];
    assignmentFormatters?: string[];
    assignmentProjectRoles?: string[];
    requestMembers?: string[];
    requestSkills?: string[];
  };
}

// API response types
export interface ScheduleBackup {
  id: string;
  type: BackupType;
  status: BackupStatus;
  label?: string | null;
  description?: string | null;
  parentBackupId?: string | null;
  snapshotTimestamp: string;
  backupMonth: string;
  filePath: string;
  fileSizeBytes: number;
  recordCounts: BackupRecordCounts;
  triggeredBy?: string | null;
  isAutomatic: boolean;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface ScheduleBackupDetail extends ScheduleBackup {
  childBackups: Pick<ScheduleBackup, 'id' | 'type' | 'createdAt' | 'status'>[];
}

// DTOs
export interface CreateBackupDto {
  type: BackupType;
  label?: string;
  description?: string;
}

export interface RestoreBackupDto {
  dryRun?: boolean;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  incrementalBackupIntervalMinutes: number; // 0 = disabled
  retentionMonths: number; // Auto-delete backups older than N months
  maxBackups: number; // Maximum backups to retain
}

export interface RestoreResult {
  success: boolean;
  dryRun: boolean;
  backupId: string;
  restoredAt?: string;
  recordCounts: BackupRecordCounts;
  errors: string[];
}
