-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ScheduleBackup" (
    "id" TEXT NOT NULL,
    "type" "BackupType" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "label" TEXT,
    "description" TEXT,
    "parentBackupId" TEXT,
    "snapshotTimestamp" TIMESTAMP(3) NOT NULL,
    "backupMonth" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "recordCounts" JSONB NOT NULL,
    "triggeredBy" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleBackup_type_idx" ON "ScheduleBackup"("type");

-- CreateIndex
CREATE INDEX "ScheduleBackup_status_idx" ON "ScheduleBackup"("status");

-- CreateIndex
CREATE INDEX "ScheduleBackup_createdAt_idx" ON "ScheduleBackup"("createdAt");

-- CreateIndex
CREATE INDEX "ScheduleBackup_backupMonth_idx" ON "ScheduleBackup"("backupMonth");

-- CreateIndex
CREATE INDEX "ScheduleBackup_parentBackupId_idx" ON "ScheduleBackup"("parentBackupId");

-- AddForeignKey
ALTER TABLE "ScheduleBackup" ADD CONSTRAINT "ScheduleBackup_parentBackupId_fkey" FOREIGN KEY ("parentBackupId") REFERENCES "ScheduleBackup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
