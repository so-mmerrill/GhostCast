import {
  IsString,
  IsOptional,
  IsDate,
  IsArray,
  IsObject,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAssignmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @IsString()
  @IsNotEmpty()
  projectTypeId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  memberIds!: string[];

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
  requestId?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
