import { IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class BackupScheduleConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsNumber()
  @Min(0)
  @Max(10080) // max 1 week in minutes
  incrementalBackupIntervalMinutes!: number;

  @IsNumber()
  @Min(1)
  @Max(120) // max 10 years
  retentionMonths!: number;

  @IsNumber()
  @Min(1)
  @Max(1000)
  maxBackups!: number;
}
