import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LlmChatController } from './llm-chat.controller';
import { LlmChatService } from './llm-chat.service';
import { MembersModule } from '../members/members.module';
import { RequestsModule } from '../requests/requests.module';
import { UserSettingsModule } from '../user-settings/user-settings.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ProjectTypesModule } from '../project-types/project-types.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    HttpModule,
    MembersModule,
    RequestsModule,
    UserSettingsModule,
    AssignmentsModule,
    ProjectTypesModule,
    DatabaseModule,
  ],
  controllers: [LlmChatController],
  providers: [LlmChatService],
  exports: [LlmChatService],
})
export class LlmChatModule {}
