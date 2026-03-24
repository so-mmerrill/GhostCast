import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { ExternalIdMappingService } from '../ingestion/services/external-id-mapping.service';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  ConflictStrategy,
  ProcessingMode,
  IngestionMember,
} from '@ghostcast/shared';
import { KantataApiClient } from './kantata-api.client';
import {
  KantataCustomFieldValue,
  KantataUser,
  KantataSyncConfig,
  KantataSyncResult,
} from './types';

const SOURCE_NAME = 'kantata-members';
const ENTITY_TYPE = 'Member';

@Injectable()
export class KantataMembersSyncService {
  private readonly logger = new Logger(KantataMembersSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionService: IngestionService,
    private readonly externalIdMapping: ExternalIdMappingService,
    private readonly integrationsService: IntegrationsService,
    private readonly kantataClient: KantataApiClient,
  ) {}

  /**
   * Run a full sync of members from Kantata
   */
  async sync(triggeredBy?: string): Promise<KantataSyncResult> {
    const startedAt = new Date();

    try {
      // Get integration config
      const config = await this.getConfig();
      if (!config) {
        throw new Error(
          'Kantata Members integration is not configured. Please configure the integration settings.',
        );
      }

      this.logger.log(
        `Starting Kantata members sync (triggeredBy: ${triggeredBy || 'system'})`,
      );

      // Fetch all users from Kantata
      const { users: kantataUsers, customFieldValues } = await this.kantataClient.fetchAllUsers(
        config.apiBaseUrl,
        config.oauthToken,
      );

      this.logger.log(`Fetched ${kantataUsers.length} users from Kantata`);

      // Perform email fallback matching for users without existing mappings
      await this.performEmailFallbackMatching(kantataUsers);

      // Transform to ingestion format
      const members = this.transformToIngestionMembers(kantataUsers, customFieldValues);

      // Run ingestion
      const result = await this.ingestionService.ingest({
        options: {
          source: SOURCE_NAME,
          conflictStrategy: config.conflictStrategy,
          processingMode: ProcessingMode.SYNC,
          dryRun: false,
          triggeredBy,
        },
        data: {
          members,
        },
      });

      // Link managers (second pass after all members are created)
      const managersLinked = await this.linkManagers(kantataUsers);

      // Handle missing member deactivation if enabled
      let deactivatedCount = 0;
      if (config.deactivateMissing) {
        const kantataUserIds = kantataUsers.map((u) => u.id);
        deactivatedCount = await this.deactivateMissingMembers(kantataUserIds);
      }

      const completedAt = new Date();

      this.logger.log(
        `Kantata sync completed: ${result.summary.created} created, ${result.summary.updated} updated, ${result.summary.skipped} skipped, ${result.summary.failed} failed, ${deactivatedCount} deactivated, ${managersLinked} managers linked`,
      );

      return {
        success: result.success,
        startedAt,
        completedAt,
        summary: result.summary,
        deactivated: deactivatedCount,
        managersLinked,
        errors: result.errors,
      };
    } catch (error) {
      const completedAt = new Date();
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Kantata sync failed: ${errorMessage}`);

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
   * Transform Kantata users to IngestionMember format
   */
  private transformToIngestionMembers(
    kantataUsers: KantataUser[],
    customFieldValues: Map<string, KantataCustomFieldValue>,
  ): IngestionMember[] {
    return kantataUsers.map((user) => {
      // Split full_name into firstName and lastName
      const nameParts = user.full_name.trim().split(/\s+/).filter(Boolean);
      let firstName: string;
      let lastName: string;

      if (nameParts.length === 0) {
        // No name provided - use placeholder
        firstName = 'Unknown';
        lastName = 'User';
      } else if (nameParts.length === 1) {
        // Single name - use as firstName, provide placeholder lastName
        firstName = nameParts[0] ?? 'Unknown';
        lastName = '-';
      } else {
        // Multiple parts - first word is firstName, rest is lastName
        firstName = nameParts[0] ?? 'Unknown';
        lastName = nameParts.slice(1).join(' ');
      }

      // Extract department from custom fields
      const department = this.extractDepartmentFromCustomFields(user, customFieldValues);

      return {
        externalId: user.id,
        employeeId: user.id,
        firstName,
        lastName,
        email: user.email_address,
        position: user.headline,
        department,
        metadata: {
          kantataId: user.id,
          managerKantataId: user.manager_id,
          source: SOURCE_NAME,
          lastSyncedAt: new Date().toISOString(),
          disabled: user.disabled,
          photoPath: user.photo_path,
          bio: user.bio,
          city: user.city,
          country: user.country,
          classification: user.classification,
        },
      };
    });
  }

  /**
   * Extract the Department value from a user's custom fields
   */
  private extractDepartmentFromCustomFields(
    user: KantataUser,
    customFieldValues: Map<string, KantataCustomFieldValue>,
  ): string | undefined {
    if (!user.custom_field_value_ids || user.custom_field_value_ids.length === 0) {
      return undefined;
    }

    for (const cfvId of user.custom_field_value_ids) {
      const cfv = customFieldValues.get(cfvId);
      if (cfv && cfv.custom_field_name?.toLowerCase() === 'department') {
        // Use display_value for text representation, fall back to value
        return cfv.display_value ?? (typeof cfv.value === 'string' ? cfv.value : undefined);
      }
    }

    return undefined;
  }

  /**
   * For users without existing external ID mappings, try to match by email
   * and create mappings for future syncs
   */
  private async performEmailFallbackMatching(
    kantataUsers: KantataUser[],
  ): Promise<void> {
    let matchedCount = 0;

    for (const user of kantataUsers) {
      // Check if we already have a mapping for this user
      const existingMapping = await this.externalIdMapping.find(
        SOURCE_NAME,
        ENTITY_TYPE,
        user.id,
      );

      if (!existingMapping && user.email_address) {
        // Try to find existing member by email
        const existingMember = await this.prisma.member.findFirst({
          where: { email: user.email_address },
        });

        if (existingMember) {
          // Create mapping for future syncs
          await this.externalIdMapping.create(
            SOURCE_NAME,
            ENTITY_TYPE,
            user.id,
            existingMember.id,
          );
          matchedCount++;
          this.logger.debug(
            `Matched Kantata user ${user.id} to existing member ${existingMember.id} by email`,
          );
        }
      }
    }

    if (matchedCount > 0) {
      this.logger.log(
        `Created ${matchedCount} new mappings via email fallback matching`,
      );
    }
  }

  /**
   * Deactivate members that exist in GhostCast but not in the current Kantata sync
   */
  private async deactivateMissingMembers(
    kantataUserIds: string[],
  ): Promise<number> {
    // Get all mappings for this source
    const allMappings = await this.externalIdMapping.findBySource(
      SOURCE_NAME,
      ENTITY_TYPE,
    );

    // Find members that are mapped but not in current Kantata data
    const missingMappings = allMappings.filter(
      (m) => !kantataUserIds.includes(m.externalId),
    );

    if (missingMappings.length === 0) {
      return 0;
    }

    // Deactivate those members
    const internalIds = missingMappings.map((m) => m.internalId);
    const result = await this.prisma.member.updateMany({
      where: {
        id: { in: internalIds },
        isActive: true,
      },
      data: { isActive: false },
    });

    this.logger.log(`Deactivated ${result.count} members not found in Kantata`);
    return result.count;
  }

  /**
   * Link managers to members after ingestion
   * This is a second pass because managers may be processed after their reports
   */
  private async linkManagers(kantataUsers: KantataUser[]): Promise<number> {
    let linkedCount = 0;

    for (const user of kantataUsers) {
      // Skip if no manager or self-referential
      if (!user.manager_id || user.manager_id === user.id) {
        continue;
      }

      // Get internal ID for this user
      const memberMapping = await this.externalIdMapping.find(
        SOURCE_NAME,
        ENTITY_TYPE,
        user.id,
      );

      if (!memberMapping) {
        continue;
      }

      // Get internal ID for the manager
      const managerMapping = await this.externalIdMapping.find(
        SOURCE_NAME,
        ENTITY_TYPE,
        user.manager_id,
      );

      if (!managerMapping) {
        this.logger.warn(
          `Manager ${user.manager_id} not found for user ${user.id}`,
        );
        continue;
      }

      // Update the member with the manager reference
      // Use updateMany to gracefully handle case where member doesn't exist
      const updateResult = await this.prisma.member.updateMany({
        where: { id: memberMapping },
        data: { managerId: managerMapping },
      });

      if (updateResult.count > 0) {
        linkedCount++;
      }
    }

    if (linkedCount > 0) {
      this.logger.log(`Linked ${linkedCount} manager relationships`);
    }

    return linkedCount;
  }

  /**
   * Test the Kantata API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();
    if (!config) {
      return {
        success: false,
        message: 'Integration not configured',
      };
    }

    return this.kantataClient.testConnection(
      config.apiBaseUrl,
      config.oauthToken,
    );
  }
}
