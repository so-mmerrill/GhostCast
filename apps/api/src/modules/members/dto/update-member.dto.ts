import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  MinLength,
  MaxLength,
  IsObject,
} from 'class-validator';

export class UpdateMemberDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  employeeId?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  department?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  position?: string;

  @IsString()
  @IsOptional()
  managerId?: string;

  @IsString()
  @IsOptional()
  resume?: string;

  @IsString()
  @IsOptional()
  certification?: string;

  @IsString()
  @IsOptional()
  training?: string;

  @IsString()
  @IsOptional()
  education?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  @IsOptional()
  workingHours?: {
    mon?: { start: string; end: string };
    tue?: { start: string; end: string };
    wed?: { start: string; end: string };
    thu?: { start: string; end: string };
    fri?: { start: string; end: string };
    sat?: { start: string; end: string };
    sun?: { start: string; end: string };
  };

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
