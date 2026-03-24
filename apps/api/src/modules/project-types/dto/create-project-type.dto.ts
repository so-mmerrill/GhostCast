import { IsString, IsOptional, MinLength, MaxLength, Matches, IsObject } from 'class-validator';
import type { ProjectTypeFieldConfig } from '@ghostcast/shared';

export class CreateProjectTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  abbreviation?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex color' })
  color?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsObject()
  @IsOptional()
  fieldConfig?: ProjectTypeFieldConfig;
}
