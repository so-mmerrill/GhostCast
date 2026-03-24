import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  memberStatus?: 'all' | 'active' | 'inactive';

  @IsOptional()
  @IsIn(['all', 'visible', 'hidden'])
  scheduleVisibility?: 'all' | 'visible' | 'hidden';
}
