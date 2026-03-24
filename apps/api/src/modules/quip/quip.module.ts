import { Module } from '@nestjs/common';
import { QuipController } from './quip.controller';
import { QuipApiClient } from './quip-api.client';
import { QuipParserService } from './quip-parser.service';
import { UserSettingsModule } from '../user-settings/user-settings.module';
import { LlmChatModule } from '../llm-chat/llm-chat.module';
import { ProjectTypesModule } from '../project-types/project-types.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [UserSettingsModule, LlmChatModule, ProjectTypesModule, SkillsModule],
  controllers: [QuipController],
  providers: [QuipApiClient, QuipParserService],
})
export class QuipModule {}
