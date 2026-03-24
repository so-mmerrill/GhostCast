import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { IntegrationsService } from '../integrations/integrations.service';
import { KantataMembersSyncService } from './kantata-members-sync.service';
import { KantataSkillsSyncService } from './kantata-skills-sync.service';
import { KantataRequestsSyncService } from './kantata-requests-sync.service';
import { KantataAssignmentsSyncService } from './kantata-assignments-sync.service';
import { KantataFtoSyncService } from './kantata-fto-sync.service';
import { KantataHolidaysSyncService } from './kantata-holidays-sync.service';
import { SyncPipelineStep } from '@ghostcast/shared';
import { KantataSyncResult } from './types';

const INTERVAL_NAME = 'kantata-sync-pipeline';

@Injectable()
export class KantataSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KantataSchedulerService.name);
  private readonly actionMap: Map<string, () => Promise<KantataSyncResult>>;
  private isRunning = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly integrationsService: IntegrationsService,
    private readonly membersSyncService: KantataMembersSyncService,
    private readonly skillsSyncService: KantataSkillsSyncService,
    private readonly requestsSyncService: KantataRequestsSyncService,
    private readonly assignmentsSyncService: KantataAssignmentsSyncService,
    private readonly ftoSyncService: KantataFtoSyncService,
    private readonly holidaysSyncService: KantataHolidaysSyncService,
  ) {
    this.actionMap = new Map([
      ['sync', () => this.membersSyncService.sync('Kantata Sync')],
      ['sync-skills', () => this.skillsSyncService.sync('Kantata Sync')],
      ['sync-requests', () => this.requestsSyncService.sync('Kantata Sync')],
      ['sync-assignments', () => this.assignmentsSyncService.sync('Kantata Sync')],
      ['sync-fto', () => this.ftoSyncService.sync('Kantata Sync')],
      ['sync-holidays', () => this.holidaysSyncService.sync('Kantata Sync')],
    ]);
  }

  async onModuleInit() {
    await this.updateSchedule();
  }

  onModuleDestroy() {
    this.stopPipeline();
  }

  /**
   * Update the pipeline schedule based on current integration config.
   */
  async updateSchedule(): Promise<void> {
    this.stopPipeline();

    const config =
      await this.integrationsService.getConfigByCatalogId('kantata-members');

    if (!config) {
      this.logger.debug(
        'Kantata integration not configured, skipping schedule setup',
      );
      return;
    }

    const intervalMinutes = (config.syncIntervalMinutes as number) || 0;
    const pipeline = (config.syncPipeline as SyncPipelineStep[]) || [];

    if (intervalMinutes <= 0 || pipeline.length === 0) {
      this.logger.debug(
        'Sync pipeline disabled (interval is 0 or pipeline is empty)',
      );
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    const interval = setInterval(() => this.executePipeline(pipeline), intervalMs);
    this.schedulerRegistry.addInterval(INTERVAL_NAME, interval);

    const stepNames = [...pipeline]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.actionId)
      .join(' → ');

    this.logger.log(
      `Scheduled sync pipeline every ${intervalMinutes} minute(s): ${stepNames}`,
    );
  }

  /**
   * Execute the pipeline steps sequentially in order.
   */
  private async executePipeline(pipeline: SyncPipelineStep[]): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Pipeline already running, skipping this tick');
      return;
    }

    this.isRunning = true;
    const pipelineStartTime = new Date().toISOString().split('T')[0]!;
    const sorted = [...pipeline].sort((a, b) => a.order - b.order);

    this.logger.log(
      `Starting sync pipeline (${sorted.length} steps)`,
    );

    for (const step of sorted) {
      const syncFn = this.actionMap.get(step.actionId);
      if (!syncFn) {
        this.logger.warn(`Unknown action "${step.actionId}" in pipeline, skipping`);
        continue;
      }

      this.logger.log(`Pipeline step ${step.order}: ${step.actionId}`);
      try {
        const result = await syncFn();
        this.logger.log(
          `Pipeline step ${step.actionId} completed: ${result.summary.created} created, ${result.summary.updated} updated`,
        );
      } catch (error) {
        this.logger.error(
          `Pipeline step ${step.actionId} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Auto-update syncDateFilterValue after pipeline completes
    try {
      await this.integrationsService.updateConfigFieldByCatalogId(
        'kantata-members',
        { syncDateFilterValue: pipelineStartTime },
      );
      this.logger.log(
        `Updated syncDateFilterValue to ${pipelineStartTime}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update syncDateFilterValue: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.isRunning = false;
    this.logger.log('Sync pipeline completed');
  }

  /**
   * Manually trigger the configured pipeline (used by the "Execute Pipeline" action).
   */
  async triggerPipeline(): Promise<{ message: string }> {
    const config =
      await this.integrationsService.getConfigByCatalogId('kantata-members');

    if (!config) {
      return { message: 'Kantata integration not configured' };
    }

    const pipeline = (config.syncPipeline as SyncPipelineStep[]) || [];

    if (pipeline.length === 0) {
      return { message: 'No steps configured in the sync pipeline' };
    }

    if (this.isRunning) {
      return { message: 'Pipeline is already running' };
    }

    // Fire and forget — executePipeline manages its own isRunning flag
    this.executePipeline(pipeline);

    const stepNames = [...pipeline]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.actionId)
      .join(' → ');

    return { message: `Pipeline started: ${stepNames}` };
  }

  private stopPipeline(): void {
    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME);
        this.logger.debug('Stopped sync pipeline');
      }
    } catch {
      // Interval doesn't exist, ignore
    }
  }

  /**
   * Check if the pipeline is currently scheduled.
   */
  isPipelineActive(): boolean {
    try {
      return this.schedulerRegistry.doesExist('interval', INTERVAL_NAME);
    } catch {
      return false;
    }
  }

  /**
   * Get pipeline status.
   */
  getScheduleStatus(): { active: boolean; isRunning: boolean } {
    return {
      active: this.isPipelineActive(),
      isRunning: this.isRunning,
    };
  }
}
