import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
