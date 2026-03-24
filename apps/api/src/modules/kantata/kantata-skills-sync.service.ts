import { Injectable, Logger } from '@nestjs/common';
import { IngestionService } from '../ingestion/ingestion.service';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  ConflictStrategy,
  ProcessingMode,
  IngestionSkill,
  IngestionMember,
} from '@ghostcast/shared';
import { KantataApiClient } from './kantata-api.client';
import {
  KantataSkill,
  KantataSkillMembership,
  KantataSyncConfig,
  KantataSyncResult,
} from './types';

const SOURCE_NAME = 'kantata-members';

@Injectable()
export class KantataSkillsSyncService {
  private readonly logger = new Logger(KantataSkillsSyncService.name);

  constructor(
    private readonly ingestionService: IngestionService,
    private readonly integrationsService: IntegrationsService,
    private readonly kantataClient: KantataApiClient,
  ) {}

  /**
   * Run a full sync of skills from Kantata
   */
  async sync(triggeredBy?: string): Promise<KantataSyncResult> {
    const startedAt = new Date();

    try {
      // Get integration config (reuses same config as members sync)
      const config = await this.getConfig();
      if (!config) {
        throw new Error(
          'Kantata integration is not configured. Please configure the integration settings.',
        );
      }

      this.logger.log(
        `Starting Kantata skills sync (triggeredBy: ${triggeredBy || 'system'})`,
      );

      // Fetch all skills from Kantata
      const { skills: kantataSkills } = await this.kantataClient.fetchAllSkills(
        config.apiBaseUrl,
        config.oauthToken,
      );

      this.logger.log(`Fetched ${kantataSkills.length} skills from Kantata`);

      // Fetch all users with their skill memberships
      const { users: kantataUsers, skillMemberships } =
        await this.kantataClient.fetchAllUsersWithSkills(
          config.apiBaseUrl,
          config.oauthToken,
        );

      this.logger.log(
        `Fetched ${kantataUsers.length} users with ${skillMemberships.length} skill memberships`,
      );

      // Transform skills to ingestion format
      const skills = this.transformToIngestionSkills(kantataSkills);

      // Transform members with their skill associations
      const members = this.transformToIngestionMembers(
        kantataUsers,
        skillMemberships,
      );

      // Run ingestion for both skills and member skill updates
      const result = await this.ingestionService.ingest({
        options: {
          source: SOURCE_NAME,
          conflictStrategy: config.conflictStrategy,
          processingMode: ProcessingMode.SYNC,
          dryRun: false,
          triggeredBy,
        },
        data: {
          skills,
          members,
        },
      });

      const completedAt = new Date();

      this.logger.log(
        `Kantata skills sync completed: ${result.summary.created} created, ${result.summary.updated} updated, ${result.summary.skipped} skipped, ${result.summary.failed} failed`,
      );

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

      this.logger.error(`Kantata skills sync failed: ${errorMessage}`);

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
   * Transform Kantata skills to IngestionSkill format
   */
  private transformToIngestionSkills(
    kantataSkills: KantataSkill[],
  ): IngestionSkill[] {
    return kantataSkills.map((skill) => {
      const { category, description } = this.parseSkillDescription(
        skill.description,
      );

      return {
        externalId: skill.id,
        name: skill.name,
        category,
        description,
      };
    });
  }

  /**
   * Parse a skill description in the format "Category - Description text"
   * If the description doesn't match this format, category is undefined
   */
  private parseSkillDescription(description?: string): {
    category?: string;
    description?: string;
  } {
    if (!description) {
      return { category: undefined, description: undefined };
    }

    const separatorIndex = description.indexOf(' - ');
    if (separatorIndex === -1) {
      return { category: undefined, description };
    }

    const category = description.substring(0, separatorIndex).trim();
    const parsed = description.substring(separatorIndex + 3).trim();

    return {
      category: category || undefined,
      description: parsed || undefined,
    };
  }

  /**
   * Transform Kantata users with skill memberships to IngestionMember format
   * Only includes skill associations, other member data is handled by members sync
   */
  private transformToIngestionMembers(
    kantataUsers: { id: string; full_name: string }[],
    skillMemberships: KantataSkillMembership[],
  ): IngestionMember[] {
    // Group skill memberships by user
    const userSkillsMap = new Map<
      string,
      { skillId: string; level: number }[]
    >();

    for (const membership of skillMemberships) {
      const existing = userSkillsMap.get(membership.user_id) || [];
      existing.push({
        skillId: membership.skill_id,
        level: membership.level,
      });
      userSkillsMap.set(membership.user_id, existing);
    }

    // Transform users with their skills
    return kantataUsers
      .filter((user) => userSkillsMap.has(user.id))
      .map((user) => {
        const userSkills = userSkillsMap.get(user.id) || [];

        // Split full_name for firstName/lastName (required fields)
        const nameParts = user.full_name.trim().split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || '-';

        return {
          externalId: user.id,
          firstName,
          lastName,
          skillExternalIds: userSkills.map((s) => s.skillId),
          skillLevels: userSkills.map((s) => s.level),
        };
      });
  }
}
