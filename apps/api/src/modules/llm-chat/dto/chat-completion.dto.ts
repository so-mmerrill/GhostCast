import {
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsObject,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class ChatMessageDto {
  @IsString()
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @IsString()
  content!: string;
}

class PageContextDto {
  @IsString()
  pathname!: string;

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  @IsObject()
  pageData?: Record<string, unknown>;
}

export class ChatCompletionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PageContextDto)
  pageContext?: PageContextDto;

  @IsOptional()
  @IsString()
  @IsIn(['basic', 'enhanced', 'advanced'])
  contextOverride?: 'basic' | 'enhanced' | 'advanced';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedMemberIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedRequestIds?: string[];
}
