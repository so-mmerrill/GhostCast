import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BackupType } from '@ghostcast/shared';

export class CreateBackupDto {
  @IsEnum(BackupType)
  type!: BackupType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
