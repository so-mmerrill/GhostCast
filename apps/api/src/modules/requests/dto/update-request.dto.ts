import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  IsDate,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequestStatus } from '@ghostcast/shared';

export class UpdateRequestDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsEnum(RequestStatus)
  @IsOptional()
  status?: RequestStatus;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  requestedStartDate?: Date | null;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  requestedEndDate?: Date | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  projectId?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  kantataId?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  clientName?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  projectName?: string | null;

  @IsString()
  @IsOptional()
  projectTypeId?: string | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  memberIds?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  requiredMemberCount?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skillIds?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  executionWeeks?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  preparationWeeks?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  reportingWeeks?: number;

  @IsBoolean()
  @IsOptional()
  travelRequired?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  travelLocation?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  timezone?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  urlLink?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  studentCount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  format?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  location?: string | null;
}
