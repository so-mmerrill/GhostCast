import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { ExternalIdMappingService } from './services/external-id-mapping.service';
import { SkillProcessor } from './processors/skill.processor';
import { ProjectTypeProcessor } from './processors/project-type.processor';
import { FormatterProcessor } from './processors/formatter.processor';
import { MemberProcessor } from './processors/member.processor';
import { AssignmentProcessor } from './processors/assignment.processor';
import { RequestProcessor } from './processors/request.processor';

@Module({
  controllers: [IngestionController],
  providers: [
    IngestionService,
    ExternalIdMappingService,
    SkillProcessor,
    ProjectTypeProcessor,
    FormatterProcessor,
    MemberProcessor,
    AssignmentProcessor,
    RequestProcessor,
  ],
  exports: [IngestionService, ExternalIdMappingService],
})
export class IngestionModule {}
