import { IsString, IsBoolean, IsOptional, IsArray, MinLength, MaxLength } from 'class-validator';

export class CreateFormatterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectRoleIds?: string[];
}
