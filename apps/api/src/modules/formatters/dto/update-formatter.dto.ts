import { IsString, IsBoolean, IsOptional, IsArray, MinLength, MaxLength } from 'class-validator';

export class UpdateFormatterDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsBoolean()
  @IsOptional()
  isBold?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  prefix?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  suffix?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectRoleIds?: string[];
}
