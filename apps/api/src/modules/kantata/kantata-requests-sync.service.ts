import { Injectable, Logger } from '@nestjs/common';
import { IngestionService } from '../ingestion/ingestion.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ConflictStrategy,
  ProcessingMode,
  IngestionRequest,
  WebSocketEvent,
} from '@ghostcast/shared';
import { KantataApiClient } from './kantata-api.client';
import {
  KantataSyncConfig,
  KantataSyncResult,
  KantataStory,
  KantataWorkspace,
  KantataProcessedProject,
} from './types';

const SOURCE_NAME = 'kantata-requests';

@Injectable()
export class KantataRequestsSyncService {
  private readonly logger = new Logger(KantataRequestsSyncService.name);

  constructor(
    private readonly ingestionService: IngestionService,
    private readonly integrationsService: IntegrationsService,
    private readonly kantataClient: KantataApiClient,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Run a full sync of requests from Kantata
   */
  async sync(triggeredBy?: string): Promise<KantataSyncResult> {
    const startedAt = new Date();

    try {
      const config = await this.getConfig();
      if (!config) {
        throw new Error(
          'Kantata integration is not configured. Please configure the integration settings.',
        );
      }

      this.logger.log(
        `Starting Kantata requests sync (triggeredBy: ${triggeredBy || 'system'})`,
      );

      // Determine date filter based on config
      let createdAfter: string | undefined;
      let updatedAfter: string | undefined;

      // Use configured date or fall back to one year ago
      const filterDate =
        config.syncDateFilterValue ||
        (() => {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          return oneYearAgo.toISOString().split('T')[0];
        })();

      if (config.syncDateFilterType === 'updated_after') {
        updatedAfter = filterDate;
        this.logger.log(`Fetching stories updated after ${updatedAfter}`);
      } else {
        createdAfter = filterDate;
        this.logger.log(`Fetching stories created after ${createdAfter}`);
      }

      // Fetch all stories from Kantata (filtered by date, without assignments)
      const storiesData = await this.kantataClient.fetchAllStories(
        config.apiBaseUrl,
        config.oauthToken,
        200,
        createdAfter,
        updatedAfter,
        false, // Don't fetch assignments - only needed for requests
      );

      this.logger.log(
        `Fetched ${storiesData.stories.length} stories from ${Object.keys(storiesData.workspaces).length} workspaces`,
      );

      // Organize stories by workspace
      const storiesByWorkspace = this.organizeStoriesByWorkspace(
        storiesData.stories,
      );

      // Process workspaces into projects
      const processedProjects = this.processWorkspaces(
        storiesByWorkspace,
        storiesData.workspaces,
      );

      this.logger.log(`Processed ${processedProjects.length} projects`);

      // Transform to ingestion format
      const requests = this.transformToIngestionRequests(
        processedProjects,
        storiesData.workspaces,
      );

      this.logger.log(
        `Prepared ${requests.length} requests for ingestion`,
      );

      // Run ingestion for requests
      let requestResult = {
        success: true,
        summary: { totalRecords: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
        errors: [] as string[],
      };

      if (requests.length > 0) {
        requestResult = await this.ingestionService.ingest({
          options: {
            source: SOURCE_NAME,
            conflictStrategy: config.conflictStrategy,
            processingMode: ProcessingMode.SYNC,
            dryRun: false,
            triggeredBy,
          },
          data: { requests },
        });
      }

      const completedAt = new Date();

      this.logger.log(
        `Kantata requests sync completed: ${requestResult.summary.created} created, ${requestResult.summary.updated} updated`,
      );

      // Notify clients to refresh
      this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_UPDATED, {
        source: 'kantata-requests-sync',
        summary: requestResult.summary,
      });

      return {
        success: requestResult.success,
        startedAt,
        completedAt,
        summary: {
          totalRecords: requestResult.summary.totalRecords,
          created: requestResult.summary.created,
          updated: requestResult.summary.updated,
          skipped: requestResult.summary.skipped,
          failed: requestResult.summary.failed,
        },
        errors: requestResult.errors,
      };
    } catch (error) {
      const completedAt = new Date();
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Kantata requests sync failed: ${errorMessage}`);

      return {
        success: false,
        startedAt,
        completedAt,
        summary: {
          totalRecords: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
        },
        errors: [errorMessage],
      };
    }
  }

  /**
   * Get the integration configuration
   */
  private async getConfig(): Promise<KantataSyncConfig | null> {
    const config =
      await this.integrationsService.getConfigByCatalogId('kantata-members');

    if (!config?.oauthToken) {
      return null;
    }

    return {
      oauthToken: config.oauthToken as string,
      apiBaseUrl:
        (config.apiBaseUrl as string) || 'https://api.mavenlink.com/api/v1',
      conflictStrategy:
        (config.conflictStrategy as ConflictStrategy) || ConflictStrategy.SKIP,
      deactivateMissing: (config.deactivateMissing as boolean) || false,
      syncDateFilterType:
        (config.syncDateFilterType as 'created_after' | 'updated_after') ||
        'created_after',
      syncDateFilterValue: (config.syncDateFilterValue as string) || '',
    };
  }

  /**
   * Organize stories by workspace
   */
  private organizeStoriesByWorkspace(
    stories: KantataStory[],
  ): Record<string, KantataStory[]> {
    const storiesByWorkspace: Record<string, KantataStory[]> = {};

    stories.forEach((story) => {
      const workspaceId = story.workspace_id;
      if (workspaceId) {
        storiesByWorkspace[workspaceId] ??= [];
        storiesByWorkspace[workspaceId].push(story);
      }
    });

    return storiesByWorkspace;
  }

  /**
   * Check if a project is a standard project (has Execution Phase and Reporting Phase)
   */
  private isStandardProject(stories: KantataStory[]): boolean {
    const milestones = stories.filter(
      (s) => s.story_type === 'milestone' && s.parent_id === null,
    );

    const hasExecutionPhase = milestones.some(
      (m) => m.title?.toLowerCase().startsWith('execution phase'),
    );
    const hasReportingPhase = milestones.some(
      (m) => m.title?.toLowerCase().startsWith('reporting phase'),
    );

    return hasExecutionPhase && hasReportingPhase;
  }

  /**
   * Detect nested projects (assessments with Execution/Reporting phases)
   */
  private hasNestedProjects(stories: KantataStory[]): boolean {
    const topLevelItems = stories.filter((s) => s.parent_id === null);

    return topLevelItems.some((item) => {
      const childMilestones = stories.filter(
        (s) => s.story_type === 'milestone' && s.parent_id === item.id,
      );

      const hasExecutionPhase = childMilestones.some(
        (m) => m.title?.toLowerCase().startsWith('execution phase'),
      );
      const hasReportingPhase = childMilestones.some(
        (m) => m.title?.toLowerCase().startsWith('reporting phase'),
      );

      return hasExecutionPhase && hasReportingPhase;
    });
  }

  /**
   * Process workspaces into projects (for requests, we just need basic workspace info)
   */
  private processWorkspaces(
    storiesByWorkspace: Record<string, KantataStory[]>,
    workspaces: Record<string, KantataWorkspace>,
  ): KantataProcessedProject[] {
    const processedProjects: KantataProcessedProject[] = [];

    Object.entries(storiesByWorkspace).forEach(([workspaceId, stories]) => {
      const workspace = workspaces[workspaceId];
      if (!workspace) return;

      // Skip cancelled projects
      if (workspace.status?.message?.toLowerCase() === 'cancelled') {
        this.logger.debug(`Skipping cancelled project: ${workspace.title}`);
        return;
      }

      // Include if it's a standard project or has nested projects
      if (this.isStandardProject(stories) || this.hasNestedProjects(stories)) {
        processedProjects.push({
          title: workspace.title,
          workspaceId,
          start_date: workspace.start_date,
          due_date: workspace.due_date,
        });
      }
    });

    return processedProjects;
  }

  /**
   * Transform processed projects to IngestionRequest format
   */
  private transformToIngestionRequests(
    projects: KantataProcessedProject[],
    workspaces: Record<string, KantataWorkspace>,
  ): IngestionRequest[] {
    return projects.map((project) => {
      const workspace = workspaces[project.workspaceId];

      return {
        externalId: project.workspaceId,
        title: project.title,
        description: workspace?.description,
        projectId: project.workspaceId,
        projectName: project.title,
        requestedStartDate: project.start_date,
      };
    });
  }
}
