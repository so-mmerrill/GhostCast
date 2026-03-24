import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { ExternalIdMappingService } from '../ingestion/services/external-id-mapping.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ConflictStrategy,
  ProcessingMode,
  IngestionAssignment,
  WebSocketEvent,
} from '@ghostcast/shared';
import { KantataApiClient } from './kantata-api.client';
import {
  KantataSyncConfig,
  KantataSyncResult,
  KantataTimeOffEntry,
  KantataUser,
} from './types';
import { KantataAssignmentSplitService, dayAfter } from './kantata-assignment-split.service';

const SOURCE_NAME = 'kantata-fto';
const MEMBER_SOURCE_NAME = 'kantata-members';
const MEMBER_ENTITY_TYPE = 'Member';
const PROJECT_TYPE_ENTITY_TYPE = 'ProjectType';
const FTO_PROJECT_TYPE_EXTERNAL_ID = 'kantata-fto-project-type';
const FTO_PROJECT_TYPE_NAME = 'FTO';
const FTO_PROJECT_TYPE_COLOR = '#808080';
const SPLIT_TAG = 'splitFromFto';

@Injectable()
export class KantataFtoSyncService {
  private readonly logger = new Logger(KantataFtoSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionService: IngestionService,
    private readonly externalIdMapping: ExternalIdMappingService,
    private readonly integrationsService: IntegrationsService,
    private readonly kantataClient: KantataApiClient,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly assignmentSplitService: KantataAssignmentSplitService,
  ) {}

  /**
   * Run a full sync of FTO days from Kantata
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
        `Starting Kantata FTO sync (triggeredBy: ${triggeredBy || 'system'})`,
      );

      // Use config date filter, falling back to one year ago
      const createdAfter = config.syncDateFilterValue
        ? new Date(config.syncDateFilterValue + 'T00:00:00Z').toISOString()
        : (() => {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            return oneYearAgo.toISOString();
          })();

      this.logger.log(`Fetching time off entries created after ${createdAfter}`);

      // Step 1: Fetch all time off entries from last year
      const { entries, users } =
        await this.kantataClient.fetchAllTimeOffEntries(
          config.apiBaseUrl,
          config.oauthToken,
          100,
          createdAfter,
        );

      this.logger.log(
        `Fetched ${entries.length} time off entries for ${Object.keys(users).length} users`,
      );

      // Step 2: Get or create FTO project type
      const ftoProjectType = await this.getOrCreateFtoProjectType();
      if (!ftoProjectType) {
        throw new Error('Failed to create FTO project type');
      }

      // Step 3: Transform to ingestion assignments
      const assignments = await this.transformToIngestionAssignments(
        entries,
        users,
        ftoProjectType.externalId,
      );

      this.logger.log(
        `Prepared ${assignments.length} FTO assignments for ingestion`,
      );

      // Step 4: Build member claimed ranges and split existing assignments
      const memberClaimedRanges = await this.buildMemberClaimedRanges(entries);
      const splitCount = await this.assignmentSplitService.splitOverlappingAssignments(
        SPLIT_TAG,
        memberClaimedRanges,
      );
      this.logger.log(
        `Split overlapping assignments: ${splitCount.removed} members removed, ${splitCount.created} segment assignments created`,
      );

      // Step 5: Ingest FTO assignments
      let result = {
        success: true,
        summary: {
          totalRecords: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
        },
        errors: [] as string[],
      };

      if (assignments.length > 0) {
        result = await this.ingestionService.ingest({
          options: {
            source: SOURCE_NAME,
            conflictStrategy: ConflictStrategy.UPDATE,
            processingMode: ProcessingMode.SYNC,
            dryRun: false,
            triggeredBy,
          },
          data: { assignments },
        });
      }

      const completedAt = new Date();

      this.logger.log(
        `Kantata FTO sync completed: ${result.summary.created} created, ${result.summary.updated} updated, ${splitCount.removed} overrides, ${splitCount.created} splits`,
      );

      // Notify clients to refresh schedule
      this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_UPDATED, {
        source: 'kantata-fto-sync',
        summary: result.summary,
      });

      return {
        success: result.success,
        startedAt,
        completedAt,
        summary: result.summary,
        errors: result.errors,
      };
    } catch (error) {
      const completedAt = new Date();
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Kantata FTO sync failed: ${errorMessage}`);

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
   * Build member ID → claimed date ranges from FTO entries.
   * Each individual FTO date becomes a single-day range {start: date, end: date}.
   */
  private async buildMemberClaimedRanges(
    entries: KantataTimeOffEntry[],
  ): Promise<Map<string, Array<{ start: string; end: string }>>> {
    const memberRanges = new Map<string, Array<{ start: string; end: string }>>();

    // Group entries by user
    const entriesByUser = new Map<string, KantataTimeOffEntry[]>();
    for (const entry of entries) {
      const list = entriesByUser.get(entry.user_id) || [];
      list.push(entry);
      entriesByUser.set(entry.user_id, list);
    }

    for (const [userId, userEntries] of entriesByUser) {
      const memberId = await this.externalIdMapping.find(
        MEMBER_SOURCE_NAME,
        MEMBER_ENTITY_TYPE,
        userId,
      );
      if (!memberId) continue;

      const ranges = userEntries.map((e) => ({
        start: e.requested_date,
        end: e.requested_date,
      }));
      memberRanges.set(memberId, ranges);
    }

    return memberRanges;
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
      syncDateFilterValue: (config.syncDateFilterValue as string) || undefined,
    };
  }

  /**
   * Get or create an FTO project type for Kantata FTO assignments
   */
  private async getOrCreateFtoProjectType(): Promise<{
    id: string;
    name: string;
    externalId: string;
  } | null> {
    // Check existing mapping
    const existingMapping = await this.externalIdMapping.find(
      SOURCE_NAME,
      PROJECT_TYPE_ENTITY_TYPE,
      FTO_PROJECT_TYPE_EXTERNAL_ID,
    );

    if (existingMapping) {
      const projectType = await this.prisma.projectType.findUnique({
        where: { id: existingMapping },
        select: { id: true, name: true },
      });
      if (projectType) {
        return { ...projectType, externalId: FTO_PROJECT_TYPE_EXTERNAL_ID };
      }
    }

    // Find or create "FTO" project type
    let projectType = await this.prisma.projectType.findFirst({
      where: { name: FTO_PROJECT_TYPE_NAME },
      select: { id: true, name: true },
    });

    if (!projectType) {
      try {
        projectType = await this.prisma.projectType.create({
          data: {
            name: FTO_PROJECT_TYPE_NAME,
            color: FTO_PROJECT_TYPE_COLOR,
            description: 'Flexible Time Off synced from Kantata',
            isActive: true,
          },
          select: { id: true, name: true },
        });
        this.logger.log('Created new "FTO" project type');
      } catch (error) {
        this.logger.error(`Failed to create FTO project type: ${error}`);
        return null;
      }
    }

    // Create or update external ID mapping
    await this.externalIdMapping.upsert(
      SOURCE_NAME,
      PROJECT_TYPE_ENTITY_TYPE,
      FTO_PROJECT_TYPE_EXTERNAL_ID,
      projectType.id,
    );

    return { ...projectType, externalId: FTO_PROJECT_TYPE_EXTERNAL_ID };
  }

  /**
   * Transform time off entries into IngestionAssignment format.
   * Consecutive FTO days for the same user are consolidated into a single assignment.
   */
  private async transformToIngestionAssignments(
    entries: KantataTimeOffEntry[],
    users: Record<string, KantataUser>,
    projectTypeExternalId: string,
  ): Promise<IngestionAssignment[]> {
    const assignments: IngestionAssignment[] = [];

    // Group entries by user_id
    const entriesByUser = new Map<string, KantataTimeOffEntry[]>();
    for (const entry of entries) {
      const list = entriesByUser.get(entry.user_id) || [];
      list.push(entry);
      entriesByUser.set(entry.user_id, list);
    }

    for (const [userId, userEntries] of entriesByUser) {
      // Resolve member external ID via kantata-members source
      const memberMapping = await this.externalIdMapping.find(
        MEMBER_SOURCE_NAME,
        MEMBER_ENTITY_TYPE,
        userId,
      );

      if (!memberMapping) {
        const user = users[userId];
        this.logger.debug(
          `Skipping FTO entries for user ${userId} (${user?.full_name ?? 'unknown'}): not found in member mappings`,
        );
        continue;
      }

      // Ensure mapping exists under our source for ingestion processor resolution
      const ourMapping = await this.externalIdMapping.find(
        SOURCE_NAME,
        MEMBER_ENTITY_TYPE,
        userId,
      );
      if (!ourMapping) {
        await this.externalIdMapping.upsert(
          SOURCE_NAME,
          MEMBER_ENTITY_TYPE,
          userId,
          memberMapping,
        );
      }

      const user = users[userId];
      const userName = user?.full_name ?? 'Unknown';

      // Sort entries by date and consolidate consecutive days into ranges
      const sortedEntries = [...userEntries].sort((a, b) =>
        a.requested_date.localeCompare(b.requested_date),
      );

      const ranges = this.consolidateConsecutiveDates(sortedEntries);

      for (const range of ranges) {
        const externalId = `fto-${userId}-${range.startDate}-${range.endDate}`;

        assignments.push({
          externalId,
          title: 'FTO',
          description: `Flexible Time Off for ${userName} (${range.totalHours} hours)`,
          startDate: range.startDate,
          endDate: range.endDate,
          projectTypeExternalId,
          memberExternalIds: [userId],
          metadata: {
            kantataTimeOffEntryIds: range.entryIds,
            kantataUserId: userId,
            hours: range.totalHours,
            source: SOURCE_NAME,
          },
        });
      }
    }

    return assignments;
  }

  /**
   * Consolidate consecutive dates into ranges.
   * Consecutive means the next calendar day (not just weekdays).
   */
  private consolidateConsecutiveDates(
    sortedEntries: KantataTimeOffEntry[],
  ): Array<{
    startDate: string;
    endDate: string;
    entryIds: string[];
    totalHours: number;
  }> {
    const firstEntry = sortedEntries[0];
    if (!firstEntry) {
      return [];
    }

    const ranges: Array<{
      startDate: string;
      endDate: string;
      entryIds: string[];
      totalHours: number;
    }> = [];

    let currentRange = {
      startDate: firstEntry.requested_date,
      endDate: firstEntry.requested_date,
      entryIds: [firstEntry.id],
      totalHours: firstEntry.hours,
    };

    for (let i = 1; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i]!;
      const expectedNextDay = dayAfter(currentRange.endDate);

      if (entry.requested_date === expectedNextDay) {
        // Consecutive day - extend current range
        currentRange.endDate = entry.requested_date;
        currentRange.entryIds.push(entry.id);
        currentRange.totalHours += entry.hours;
      } else {
        // Gap in dates - start a new range
        ranges.push(currentRange);
        currentRange = {
          startDate: entry.requested_date,
          endDate: entry.requested_date,
          entryIds: [entry.id],
          totalHours: entry.hours,
        };
      }
    }

    // Don't forget the last range
    ranges.push(currentRange);

    return ranges;
  }
}
