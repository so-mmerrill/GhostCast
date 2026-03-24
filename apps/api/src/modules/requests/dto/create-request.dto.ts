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

export class CreateRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsEnum(RequestStatus)
  @IsOptional()
  status?: RequestStatus;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  requestedStartDate?: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  requestedEndDate?: Date;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  projectId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  kantataId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  clientName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  projectName?: string;

  @IsString()
  @IsOptional()
  projectTypeId?: string;

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
  travelLocation?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  timezone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  urlLink?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  studentCount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  format?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  location?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
