import {
  IsString,
  IsOptional,
  IsDate,
  IsArray,
  IsEnum,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssignmentStatus } from '@ghostcast/shared';

export class UpdateAssignmentDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startDate?: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  endDate?: Date;

  @IsString()
  @IsOptional()
  projectTypeId?: string;

  @IsEnum(AssignmentStatus)
  @IsOptional()
  status?: AssignmentStatus;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  memberIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skillIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  formatterIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectRoleIds?: string[];

  @IsString()
  @IsOptional()
  requestId?: string | null;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
