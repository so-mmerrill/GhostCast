import { IsString, IsOptional, IsArray, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateProjectRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex color' })
  color?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  formatterIds?: string[];
}
