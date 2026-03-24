import { IsNotEmpty } from 'class-validator';

export class UpdateConfigDto {
  @IsNotEmpty()
  value: unknown;
}
