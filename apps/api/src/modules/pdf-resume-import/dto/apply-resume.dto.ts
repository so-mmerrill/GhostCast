import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class ApplyResumeDto {
  @IsOptional()
  @IsString()
  resume?: string;

  @IsOptional()
  @IsString()
  certification?: string;

  @IsOptional()
  @IsString()
  training?: string;

  @IsOptional()
  @IsString()
  education?: string;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}
