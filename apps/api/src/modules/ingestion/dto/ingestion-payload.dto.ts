import { Type } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsEmail,
  IsObject,
} from 'class-validator';
import {
  ConflictStrategy,
  ProcessingMode,
  AssignmentStatus,
  RequestStatus,
} from '@ghostcast/shared';

// ===================================
// Entity DTOs
// ===================================

export class IngestionSkillDto {
  @IsString()
  @MinLength(1)
  externalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class IngestionProjectTypeDto {
  @IsString()
  @MinLength(1)
  externalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class IngestionFormatterDto {
  @IsString()
  @MinLength(1)
  externalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isBold?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  prefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  suffix?: string;
}

export class IngestionMemberDto {
  @IsString()
  @MinLength(1)
  externalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  employeeId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsObject()
  workingHours?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillExternalIds?: string[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  skillLevels?: number[];
}

export class IngestionAssignmentDto {
  @IsString()
  @MinLength(1)
  externalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @IsString()
  @MinLength(1)
  projectTypeExternalId!: string;

  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  memberExternalIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillExternalIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formatterExternalIds?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class IngestionRequestDto {
  @IsString()
  @MinLength(1)
  externalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @IsString()
  requestedStartDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @IsOptional()
  @IsString()
  projectTypeExternalId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberExternalIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skillExternalIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  executionWeeks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  preparationWeeks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reportingWeeks?: number;

  @IsOptional()
  @IsBoolean()
  travelRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  urlLink?: string;
}

// ===================================
// Options DTO
// ===================================

export class IngestionOptionsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  source!: string;

  @IsEnum(ConflictStrategy)
  conflictStrategy!: ConflictStrategy;

  @IsEnum(ProcessingMode)
  processingMode!: ProcessingMode;

  @IsBoolean()
  dryRun!: boolean;

  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  batchSize?: number;

  @IsOptional()
  @IsString()
  triggeredBy?: string;
}

// ===================================
// Data DTO
// ===================================

export class IngestionDataDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestionSkillDto)
  skills?: IngestionSkillDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestionProjectTypeDto)
  projectTypes?: IngestionProjectTypeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestionFormatterDto)
  formatters?: IngestionFormatterDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestionMemberDto)
  members?: IngestionMemberDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestionAssignmentDto)
  assignments?: IngestionAssignmentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestionRequestDto)
  requests?: IngestionRequestDto[];
}

// ===================================
// Main Payload DTO
// ===================================

export class IngestionPayloadDto {
  @ValidateNested()
  @Type(() => IngestionOptionsDto)
  options!: IngestionOptionsDto;

  @ValidateNested()
  @Type(() => IngestionDataDto)
  data!: IngestionDataDto;
}
