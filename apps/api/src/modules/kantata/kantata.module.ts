import { Module, OnModuleInit } from '@nestjs/common';
import { KantataApiClient } from './kantata-api.client';
import { KantataMembersSyncService } from './kantata-members-sync.service';
import { KantataSkillsSyncService } from './kantata-skills-sync.service';
import { KantataRequestsSyncService } from './kantata-requests-sync.service';
import { KantataAssignmentsSyncService } from './kantata-assignments-sync.service';
import { KantataFtoSyncService } from './kantata-fto-sync.service';
import { KantataHolidaysSyncService } from './kantata-holidays-sync.service';
import { KantataAssignmentSplitService } from './kantata-assignment-split.service';
import { KantataMembersController } from './kantata-members.controller';
import { KantataSchedulerService } from './kantata-scheduler.service';
import { IngestionModule } from '../ingestion/ingestion.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { IntegrationsService } from '../integrations/integrations.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [IngestionModule, IntegrationsModule, RealtimeModule],
  controllers: [KantataMembersController],
  providers: [
    KantataApiClient,
    KantataAssignmentSplitService,
    KantataMembersSyncService,
    KantataSkillsSyncService,
    KantataRequestsSyncService,
    KantataAssignmentsSyncService,
    KantataFtoSyncService,
    KantataHolidaysSyncService,
    KantataSchedulerService,
  ],
  exports: [
    KantataMembersSyncService,
    KantataSkillsSyncService,
    KantataRequestsSyncService,
    KantataAssignmentsSyncService,
    KantataFtoSyncService,
    KantataHolidaysSyncService,
    KantataSchedulerService,
  ],
})
export class KantataModule implements OnModuleInit {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly syncService: KantataMembersSyncService,
    private readonly skillsSyncService: KantataSkillsSyncService,
    private readonly requestsSyncService: KantataRequestsSyncService,
    private readonly assignmentsSyncService: KantataAssignmentsSyncService,
    private readonly ftoSyncService: KantataFtoSyncService,
    private readonly holidaysSyncService: KantataHolidaysSyncService,
    private readonly schedulerService: KantataSchedulerService,
  ) {}

  onModuleInit() {
    // Register the members sync action handler
    this.integrationsService.registerActionHandler(
      'kantata-members',
      'sync',
      () => this.syncService.sync('Kantata Sync'),
    );

    // Register the skills sync action handler
    this.integrationsService.registerActionHandler(
      'kantata-members',
      'sync-skills',
      () => this.skillsSyncService.sync('Kantata Sync'),
    );

    // Register the requests sync action handler
    this.integrationsService.registerActionHandler(
      'kantata-members',
      'sync-requests',
      () => this.requestsSyncService.sync('Kantata Sync'),
    );

    // Register the assignments sync action handler
    this.integrationsService.registerActionHandler(
      'kantata-members',
      'sync-assignments',
      () => this.assignmentsSyncService.sync('Kantata Sync'),
    );

    // Register the FTO sync action handler
    this.integrationsService.registerActionHandler(
      'kantata-members',
      'sync-fto',
      () => this.ftoSyncService.sync('Kantata Sync'),
    );

    // Register the holidays sync action handler
    this.integrationsService.registerActionHandler(
      'kantata-members',
      'sync-holidays',
      () => this.holidaysSyncService.sync('Kantata Sync'),
    );

    // Register the execute pipeline action handler
    this.integrationsService.registerActionHandler(
      'kantata-members',
      'execute-pipeline',
      () => this.schedulerService.triggerPipeline(),
    );
  }
}
