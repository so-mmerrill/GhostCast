import { Module } from '@nestjs/common';
import { PdfResumeImportController } from './pdf-resume-import.controller';
import { PdfResumeImportService } from './pdf-resume-import.service';
import { LlmChatModule } from '../llm-chat/llm-chat.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [LlmChatModule, MembersModule],
  controllers: [PdfResumeImportController],
  providers: [PdfResumeImportService],
  exports: [PdfResumeImportService],
})
export class PdfResumeImportModule {}
