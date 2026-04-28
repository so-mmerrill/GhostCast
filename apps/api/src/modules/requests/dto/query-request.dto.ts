import { IsOptional, IsEnum, IsArray, IsDateString, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RequestStatus } from '@ghostcast/shared';

export class QueryRequestDto extends PaginationDto {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(RequestStatus, { each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  statuses?: RequestStatus[];

  @IsOptional()
  @IsDateString()
  scheduledWithinStartDate?: string;

  @IsOptional()
  @IsDateString()
  scheduledWithinEndDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  memberIds?: string[];
}
