import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExternalIdMappingService } from '../ingestion/services/external-id-mapping.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ConflictStrategy, WebSocketEvent } from '@ghostcast/shared';
import { KantataApiClient } from './kantata-api.client';
import { KantataSyncConfig, KantataSyncResult, KantataHoliday } from './types';
import { KantataAssignmentSplitService } from './kantata-assignment-split.service';

const SOURCE_NAME = 'kantata-holidays';
const PROJECT_TYPE_ENTITY_TYPE = 'ProjectType';
const HOLIDAY_PROJECT_TYPE_EXTERNAL_ID = 'kantata-holiday-project-type';
const HOLIDAY_PROJECT_TYPE_NAME = 'Holiday';
const HOLIDAY_PROJECT_TYPE_COLOR = '#808080';
const DEFAULT_HOLIDAY_CALENDAR_NAME = 'Account Default';
const SPLIT_TAG = 'splitFromHoliday';

@Injectable()
export class KantataHolidaysSyncService {
  private readonly logger = new Logger(KantataHolidaysSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalIdMapping: ExternalIdMappingService,
    private readonly integrationsService: IntegrationsService,
    private readonly kantataClient: KantataApiClient,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly assignmentSplitService: KantataAssignmentSplitService,
  ) {}

  /**
   * Run a full sync of holidays from Kantata
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
        `Starting Kantata holidays sync (triggeredBy: ${triggeredBy || 'system'})`,
      );

      // Step 1: Fetch all holidays with their user associations
      const { holidays, holidayUserIds, calendars, holidayCalendarIds } =
        await this.kantataClient.fetchAllHolidays(
          config.apiBaseUrl,
          config.oauthToken,
        );

      this.logger.log(`Fetched ${holidays.length} holidays from Kantata`);

      // Step 1b: Find the default calendar and filter holidays to only those in it
      const defaultCalendarEntry = [...calendars.entries()].find(
        ([, calendar]) => calendar.name === DEFAULT_HOLIDAY_CALENDAR_NAME,
      );

      if (!defaultCalendarEntry) {
        this.logger.warn(
          `Default holiday calendar "${DEFAULT_HOLIDAY_CALENDAR_NAME}" not found. Available calendars: ${[...calendars.values()].map((c) => c.name).join(', ')}`,
        );
        throw new Error(
          `Default holiday calendar "${DEFAULT_HOLIDAY_CALENDAR_NAME}" not found in Kantata`,
        );
      }

      const defaultCalendarId = defaultCalendarEntry[0];

      // Filter holidays to only those associated with the default calendar
      const filteredHolidays = holidays.filter((holiday) => {
        const calendarIds = holidayCalendarIds.get(holiday.id) || [];
        return calendarIds.includes(defaultCalendarId);
      });

      this.logger.log(
        `Filtered to ${filteredHolidays.length} holidays from "${DEFAULT_HOLIDAY_CALENDAR_NAME}" calendar`,
      );

      // Step 2: Get or create Holiday project type
      const holidayProjectType = await this.getOrCreateHolidayProjectType();
      if (!holidayProjectType) {
        throw new Error('Failed to create Holiday project type');
      }

      // Step 3: Build Kantata user ID to local member ID mapping
      const kantataUserToMemberMap = await this.buildKantataUserToMemberMap();

      this.logger.log(
        `Built mapping for ${kantataUserToMemberMap.size} Kantata users to local members`,
      );

      // Step 3b: Get all active members as fallback for holidays without specific associations
      const allActiveMembers = await this.prisma.member.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      const allActiveMemberIds = allActiveMembers.map((m) => m.id);

      this.logger.log(
        `Found ${allActiveMemberIds.length} active members for holiday fallback`,
      );

      // Step 4: Clean up legacy holiday modifications and split using shared service
      await this.cleanupLegacyHolidayModifications();

      const memberClaimedRanges = this.buildMemberClaimedRanges(
        filteredHolidays,
        holidayUserIds,
        kantataUserToMemberMap,
        allActiveMemberIds,
      );

      const splitCount = await this.assignmentSplitService.splitOverlappingAssignments(
        SPLIT_TAG,
        memberClaimedRanges,
      );
      this.logger.log(
        `Split overlapping assignments: ${splitCount.removed} members removed, ${splitCount.created} segment assignments created`,
      );

      // Step 5: Create or update holiday assignments (always overwrite — holidays take priority)
      const { created, updated } = await this.syncHolidayAssignments(
        filteredHolidays,
        holidayUserIds,
        kantataUserToMemberMap,
        allActiveMemberIds,
        holidayProjectType.id,
      );

      this.logger.log(
        `Synced ${filteredHolidays.length} holidays: ${created} created, ${updated} updated`,
      );

      const completedAt = new Date();
      const summary = {
        totalRecords: filteredHolidays.length,
        created,
        updated,
        skipped: 0,
        failed: 0,
      };

      this.logger.log(
        `Kantata holidays sync completed: ${created} created, ${updated} updated, ${splitCount.removed} overrides, ${splitCount.created} splits`,
      );

      // Notify clients to refresh schedule
      this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_UPDATED, {
        source: 'kantata-holidays-sync',
        summary,
      });

      return {
        success: true,
        startedAt,
        completedAt,
        summary,
        errors: [],
      };
    } catch (error) {
      const completedAt = new Date();
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Kantata holidays sync failed: ${errorMessage}`);

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
    };
  }

  /**
   * Get or create a Holiday project type for Kantata holiday assignments
   */
  private async getOrCreateHolidayProjectType(): Promise<{
    id: string;
    name: string;
    externalId: string;
  } | null> {
    // Check existing mapping
    const existingMapping = await this.externalIdMapping.find(
      SOURCE_NAME,
      PROJECT_TYPE_ENTITY_TYPE,
      HOLIDAY_PROJECT_TYPE_EXTERNAL_ID,
    );

    if (existingMapping) {
      const projectType = await this.prisma.projectType.findUnique({
        where: { id: existingMapping },
        select: { id: true, name: true },
      });
      if (projectType) {
        return { ...projectType, externalId: HOLIDAY_PROJECT_TYPE_EXTERNAL_ID };
      }
    }

    // Find or create "Holiday" project type
    let projectType = await this.prisma.projectType.findFirst({
      where: { name: HOLIDAY_PROJECT_TYPE_NAME },
      select: { id: true, name: true },
    });

    if (!projectType) {
      try {
        projectType = await this.prisma.projectType.create({
          data: {
            name: HOLIDAY_PROJECT_TYPE_NAME,
            color: HOLIDAY_PROJECT_TYPE_COLOR,
            description: 'Company-wide holidays synced from Kantata',
            isActive: true,
          },
          select: { id: true, name: true },
        });
        this.logger.log('Created new "Holiday" project type');
      } catch (error) {
        this.logger.error(`Failed to create Holiday project type: ${error}`);
        return null;
      }
    }

    // Create or update external ID mapping
    await this.externalIdMapping.upsert(
      SOURCE_NAME,
      PROJECT_TYPE_ENTITY_TYPE,
      HOLIDAY_PROJECT_TYPE_EXTERNAL_ID,
      projectType.id,
    );

    return { ...projectType, externalId: HOLIDAY_PROJECT_TYPE_EXTERNAL_ID };
  }

  /**
   * Get a system user ID for assignment creation.
   */
  private async getSystemUserId(): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });

    if (!admin) {
      throw new Error('No active admin user found for holiday assignment creation');
    }

    return admin.id;
  }

  /**
   * Build a mapping of Kantata user IDs to local member IDs using external ID mappings.
   */
  private async buildKantataUserToMemberMap(): Promise<Map<string, string>> {
    const mappings = await this.prisma.externalIdMapping.findMany({
      where: {
        source: 'kantata-members',
        entityType: 'Member',
      },
      select: {
        externalId: true,
        internalId: true,
      },
    });

    const map = new Map<string, string>();
    for (const mapping of mappings) {
      map.set(mapping.externalId, mapping.internalId);
    }

    return map;
  }

  /**
   * Get member IDs for a specific holiday, falling back to all active members.
   */
  private getMemberIdsForHoliday(
    holiday: KantataHoliday,
    holidayUserIds: Map<string, string[]>,
    kantataUserToMemberMap: Map<string, string>,
    allActiveMemberIds: string[],
  ): string[] {
    const kantataUserIdsForHoliday = holidayUserIds.get(holiday.id) || [];
    const memberIds = kantataUserIdsForHoliday
      .map((kantataUserId) => kantataUserToMemberMap.get(kantataUserId))
      .filter((memberId): memberId is string => memberId !== undefined);

    if (memberIds.length === 0) {
      this.logger.debug(
        `Holiday "${holiday.name}" (${holiday.id}) has no specific associations, applying to all ${allActiveMemberIds.length} active members`,
      );
      return allActiveMemberIds;
    }

    return memberIds;
  }

  /**
   * Build member ID → claimed date ranges for all holidays (per-member approach).
   * Each holiday date becomes a single-day range per affected member.
   */
  private buildMemberClaimedRanges(
    holidays: KantataHoliday[],
    holidayUserIds: Map<string, string[]>,
    kantataUserToMemberMap: Map<string, string>,
    allActiveMemberIds: string[],
  ): Map<string, Array<{ start: string; end: string }>> {
    const memberRanges = new Map<string, Array<{ start: string; end: string }>>();

    for (const holiday of holidays) {
      const memberIds = this.getMemberIdsForHoliday(
        holiday,
        holidayUserIds,
        kantataUserToMemberMap,
        allActiveMemberIds,
      );

      const endDate = holiday.end_date || holiday.start_date;

      // Expand the holiday into individual dates
      const currentDate = new Date(holiday.start_date + 'T00:00:00Z');
      const lastDate = new Date(endDate + 'T00:00:00Z');

      while (currentDate <= lastDate) {
        const dateStr = currentDate.toISOString().substring(0, 10);
        for (const memberId of memberIds) {
          const ranges = memberRanges.get(memberId) || [];
          ranges.push({ start: dateStr, end: dateStr });
          memberRanges.set(memberId, ranges);
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
    }

    return memberRanges;
  }

  /**
   * Clean up legacy holiday modifications from the old per-assignment approach.
   * Restores original dates on assignments marked with `modifiedByHoliday`.
   * Also cleans up old-style `splitFromHoliday` segments that stored memberIds in metadata.
   */
  private async cleanupLegacyHolidayModifications(): Promise<void> {
    // 1. Restore modified assignments to their original dates
    const modifiedAssignments = await this.prisma.assignment.findMany({
      where: {
        metadata: { path: ['modifiedByHoliday'], equals: true },
      },
      select: { id: true, metadata: true },
    });

    for (const modified of modifiedAssignments) {
      const meta = modified.metadata as Record<string, unknown>;
      const originalStartDate = meta.originalStartDate as string | undefined;
      const originalEndDate = meta.originalEndDate as string | undefined;

      if (originalStartDate && originalEndDate) {
        const cleanMetadata = { ...meta };
        delete cleanMetadata.modifiedByHoliday;
        delete cleanMetadata.originalStartDate;
        delete cleanMetadata.originalEndDate;

        await this.prisma.assignment.update({
          where: { id: modified.id },
          data: {
            startDate: new Date(originalStartDate + 'T00:00:00Z'),
            endDate: new Date(originalEndDate + 'T00:00:00Z'),
            metadata: cleanMetadata as object,
          },
        });
      }
    }

    // 2. Clean up old-style splitFromHoliday segments that have memberIds in metadata
    // (legacy format from the per-assignment approach)
    const legacySplits = await this.prisma.assignment.findMany({
      where: {
        metadata: {
          path: ['splitFromHoliday'],
          equals: true,
        },
      },
      select: { id: true, metadata: true },
    });

    const legacySplitsWithMemberIds = legacySplits.filter((s) => {
      const meta = s.metadata as Record<string, unknown>;
      return Array.isArray(meta?.memberIds);
    });

    if (legacySplitsWithMemberIds.length > 0) {
      for (const split of legacySplitsWithMemberIds) {
        const splitMeta = split.metadata as Record<string, unknown>;
        const originalAssignmentId = splitMeta?.originalAssignmentId as string | undefined;
        const memberIds = splitMeta?.memberIds as string[] | undefined;

        if (originalAssignmentId && memberIds) {
          const originalExists = await this.prisma.assignment.findUnique({
            where: { id: originalAssignmentId },
            select: { id: true },
          });

          if (originalExists) {
            for (const memberId of memberIds) {
              const alreadyOn = await this.prisma.assignmentMember.findUnique({
                where: {
                  assignmentId_memberId: { assignmentId: originalAssignmentId, memberId },
                },
              });
              if (!alreadyOn) {
                await this.prisma.assignmentMember.create({
                  data: { assignmentId: originalAssignmentId, memberId },
                });
              }
            }
          }
        }
      }

      await this.prisma.assignment.deleteMany({
        where: { id: { in: legacySplitsWithMemberIds.map((s) => s.id) } },
      });
    }

    const totalCleanedUp = modifiedAssignments.length + legacySplitsWithMemberIds.length;
    if (totalCleanedUp > 0) {
      this.logger.debug(
        `Cleaned up ${modifiedAssignments.length} modified assignments and ${legacySplitsWithMemberIds.length} legacy split segments`,
      );
    }
  }

  /**
   * Validate that an assignment exists and clean up stale mapping if not.
   */
  private async validateAssignmentMapping(
    existingAssignmentId: string,
    externalId: string,
    holidayName: string,
  ): Promise<string | null> {
    const assignmentExists = await this.prisma.assignment.findUnique({
      where: { id: existingAssignmentId },
      select: { id: true },
    });

    if (assignmentExists) {
      return existingAssignmentId;
    }

    this.logger.warn(
      `Stale mapping found for holiday "${holidayName}" - assignment ${existingAssignmentId} no longer exists, will create new`,
    );
    await this.prisma.externalIdMapping.delete({
      where: {
        source_entityType_externalId: {
          source: SOURCE_NAME,
          entityType: 'Assignment',
          externalId,
        },
      },
    });
    return null;
  }

  /**
   * Build holiday metadata object.
   */
  private buildHolidayMetadata(holiday: KantataHoliday): {
    isHoliday: boolean;
    kantataHolidayId: string;
    holidayName: string;
    paid: boolean;
    totalHours: number;
    source: string;
  } {
    return {
      isHoliday: true,
      kantataHolidayId: holiday.id,
      holidayName: holiday.name,
      paid: holiday.paid,
      totalHours: holiday.total_hours,
      source: SOURCE_NAME,
    };
  }

  /**
   * Update an existing holiday assignment for a single member.
   */
  private async updateHolidayAssignment(
    assignmentId: string,
    holiday: KantataHoliday,
    memberId: string,
  ): Promise<void> {
    const endDate = holiday.end_date || holiday.start_date;

    await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        title: 'Holiday',
        description: `${holiday.name}${holiday.paid ? ' (Paid)' : ''}`,
        startDate: new Date(holiday.start_date + 'T00:00:00Z'),
        endDate: new Date(endDate + 'T00:00:00Z'),
        metadata: this.buildHolidayMetadata(holiday),
      },
    });

    // Ensure the member is assigned (may have been removed by a previous pipeline step's split)
    const existingMember = await this.prisma.assignmentMember.findUnique({
      where: {
        assignmentId_memberId: { assignmentId, memberId },
      },
    });
    if (!existingMember) {
      await this.prisma.assignmentMember.create({
        data: { assignmentId, memberId },
      });
    }
  }

  /**
   * Create a new holiday assignment for a single member.
   */
  private async createHolidayAssignment(
    holiday: KantataHoliday,
    memberId: string,
    projectTypeId: string,
    createdById: string,
    externalId: string,
  ): Promise<void> {
    const endDate = holiday.end_date || holiday.start_date;

    const assignment = await this.prisma.assignment.create({
      data: {
        title: 'Holiday',
        description: `${holiday.name}${holiday.paid ? ' (Paid)' : ''}`,
        startDate: new Date(holiday.start_date + 'T00:00:00Z'),
        endDate: new Date(endDate + 'T00:00:00Z'),
        projectTypeId,
        createdById,
        metadata: this.buildHolidayMetadata(holiday),
        members: {
          create: [{ memberId }],
        },
      },
    });

    await this.externalIdMapping.upsert(
      SOURCE_NAME,
      'Assignment',
      externalId,
      assignment.id,
    );
  }

  /**
   * Create or update holiday assignments directly via Prisma.
   * Each holiday gets one assignment per member, making it easy to add/remove
   * individual members without affecting others.
   * Always overwrites — holidays take priority over conflict strategy.
   */
  private async syncHolidayAssignments(
    holidays: KantataHoliday[],
    holidayUserIds: Map<string, string[]>,
    kantataUserToMemberMap: Map<string, string>,
    allActiveMemberIds: string[],
    projectTypeId: string,
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    const createdById = await this.getSystemUserId();

    // Clean up old-style assignments (one per holiday with multiple members)
    await this.cleanupLegacyHolidayAssignments(holidays);

    for (const holiday of holidays) {
      const memberIds = this.getMemberIdsForHoliday(
        holiday,
        holidayUserIds,
        kantataUserToMemberMap,
        allActiveMemberIds,
      );

      for (const memberId of memberIds) {
        const externalId = `kantata-holiday-${holiday.id}-member-${memberId}`;

        const existingAssignmentId = await this.externalIdMapping.find(
          SOURCE_NAME,
          'Assignment',
          externalId,
        );

        const validAssignmentId = existingAssignmentId
          ? await this.validateAssignmentMapping(existingAssignmentId, externalId, holiday.name)
          : null;

        if (validAssignmentId) {
          await this.updateHolidayAssignment(validAssignmentId, holiday, memberId);
          updated++;
        } else {
          await this.createHolidayAssignment(holiday, memberId, projectTypeId, createdById, externalId);
          created++;
        }
      }
    }

    return { created, updated };
  }

  /**
   * Remove old-style holiday assignments that used one assignment per holiday
   * with multiple members (external ID format: kantata-holiday-{id}).
   */
  private async cleanupLegacyHolidayAssignments(
    holidays: KantataHoliday[],
  ): Promise<void> {
    let cleaned = 0;

    for (const holiday of holidays) {
      const legacyExternalId = `kantata-holiday-${holiday.id}`;
      const existingAssignmentId = await this.externalIdMapping.find(
        SOURCE_NAME,
        'Assignment',
        legacyExternalId,
      );

      if (!existingAssignmentId) {
        continue;
      }

      // Delete the old assignment
      const assignmentExists = await this.prisma.assignment.findUnique({
        where: { id: existingAssignmentId },
        select: { id: true },
      });

      if (assignmentExists) {
        await this.prisma.assignment.delete({
          where: { id: existingAssignmentId },
        });
      }

      // Remove the old mapping
      await this.prisma.externalIdMapping.delete({
        where: {
          source_entityType_externalId: {
            source: SOURCE_NAME,
            entityType: 'Assignment',
            externalId: legacyExternalId,
          },
        },
      });

      cleaned++;
    }

    if (cleaned > 0) {
      this.logger.log(
        `Cleaned up ${cleaned} legacy holiday assignments (migrating to per-member assignments)`,
      );
    }
  }
}
