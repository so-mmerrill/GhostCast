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
  KantataStory,
  KantataWorkspace,
  KantataUser,
  KantataStoryAssignment,
  KantataProcessedProject,
  KantataProcessedPhase,
  KantataProcessedAssignee,
} from './types';
import { KantataAssignmentSplitService, dayBefore } from './kantata-assignment-split.service';

const SOURCE_NAME = 'kantata-assignments';
const MEMBER_SOURCE_NAME = 'kantata-members';
const MEMBER_ENTITY_TYPE = 'Member';
const PROJECT_TYPE_ENTITY_TYPE = 'ProjectType';
const KANTATA_PROJECT_TYPE_EXTERNAL_ID = 'kantata-default-project-type';
const SPLIT_TAG = 'splitFromAssignmentsSync';

/** Internal type for per-member assignment tracking during overlap resolution */
interface PerMemberAssignment {
  original: IngestionAssignment;
  memberId: string;
  startDate: string;
  endDate: string;
}

// Phases to filter out
const PHASES_TO_FILTER = new Set([
  'post assessment phase',
  'admin/planning',
  'planning phase',
  'close out phase',
]);

@Injectable()
export class KantataAssignmentsSyncService {
  private readonly logger = new Logger(KantataAssignmentsSyncService.name);

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
   * Run a full sync of assignments from Kantata
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
        `Starting Kantata assignments sync (triggeredBy: ${triggeredBy || 'system'})`,
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

      // Fetch all stories from Kantata (filtered by date)
      const storiesData = await this.kantataClient.fetchAllStories(
        config.apiBaseUrl,
        config.oauthToken,
        200,
        createdAfter,
        updatedAfter,
      );

      this.logger.log(
        `Fetched ${storiesData.stories.length} stories from ${Object.keys(storiesData.workspaces).length} workspaces`,
      );

      // Link assignments to stories
      this.linkAssignmentsToStories(
        storiesData.stories,
        storiesData.assignments,
        storiesData.users,
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

      // Get or create a default project type for assignments
      const defaultProjectType = await this.getOrCreateDefaultProjectType();
      if (!defaultProjectType) {
        throw new Error('No project types available. Please create at least one project type.');
      }

      // Transform to ingestion format
      const rawAssignments = await this.transformToIngestionAssignments(
        processedProjects,
        defaultProjectType.externalId,
      );
      const assignments = this.resolveOverlappingAssignments(rawAssignments);

      this.logger.log(
        `Overlap resolution: ${rawAssignments.length} raw assignments -> ${assignments.length} resolved assignments`,
      );
      this.logger.log(
        `Prepared ${assignments.length} assignments for ingestion`,
      );

      // Split existing assignments that overlap with the new ones
      const memberRanges = await this.buildMemberClaimedRanges(assignments);
      const splitCount = await this.assignmentSplitService.splitOverlappingAssignments(
        SPLIT_TAG,
        memberRanges,
      );
      this.logger.log(
        `Split overlapping assignments: ${splitCount.removed} members removed, ${splitCount.created} segment assignments created`,
      );

      // Run ingestion for assignments
      let assignmentResult = {
        success: true,
        summary: { totalRecords: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
        errors: [] as string[],
      };

      if (assignments.length > 0) {
        assignmentResult = await this.ingestionService.ingest({
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
        `Kantata assignments sync completed: ${assignmentResult.summary.created} created, ${assignmentResult.summary.updated} updated`,
      );

      // Notify clients to refresh
      this.realtimeGateway.emitToAll(WebSocketEvent.ASSIGNMENT_UPDATED, {
        source: 'kantata-assignments-sync',
        summary: assignmentResult.summary,
      });

      return {
        success: assignmentResult.success,
        startedAt,
        completedAt,
        summary: {
          totalRecords: assignmentResult.summary.totalRecords,
          created: assignmentResult.summary.created,
          updated: assignmentResult.summary.updated,
          skipped: assignmentResult.summary.skipped,
          failed: assignmentResult.summary.failed,
        },
        errors: assignmentResult.errors,
      };
    } catch (error) {
      const completedAt = new Date();
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Kantata assignments sync failed: ${errorMessage}`);

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
   * Build member ID → claimed date ranges map from ingestion assignments.
   */
  private async buildMemberClaimedRanges(
    assignments: IngestionAssignment[],
  ): Promise<Map<string, Array<{ start: string; end: string }>>> {
    const memberRanges = new Map<string, Array<{ start: string; end: string }>>();

    for (const assignment of assignments) {
      for (const memberExtId of assignment.memberExternalIds) {
        const memberId = await this.externalIdMapping.find(
          SOURCE_NAME,
          MEMBER_ENTITY_TYPE,
          memberExtId,
        );
        if (!memberId) continue;

        const ranges = memberRanges.get(memberId) || [];
        ranges.push({ start: assignment.startDate, end: assignment.endDate });
        memberRanges.set(memberId, ranges);
      }
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
      syncDateFilterValue: (config.syncDateFilterValue as string) || '',
    };
  }

  /**
   * Get or create a default project type for Kantata assignments
   * Also ensures an external ID mapping exists for the ingestion system
   */
  private async getOrCreateDefaultProjectType(): Promise<{ id: string; name: string; externalId: string } | null> {
    // First check if we have an existing mapping
    const existingMapping = await this.externalIdMapping.find(
      SOURCE_NAME,
      PROJECT_TYPE_ENTITY_TYPE,
      KANTATA_PROJECT_TYPE_EXTERNAL_ID,
    );

    if (existingMapping) {
      // Verify the project type still exists
      const projectType = await this.prisma.projectType.findUnique({
        where: { id: existingMapping },
        select: { id: true, name: true },
      });
      if (projectType) {
        return { ...projectType, externalId: KANTATA_PROJECT_TYPE_EXTERNAL_ID };
      }
    }

    // Find or create a project type
    let projectType = await this.prisma.projectType.findFirst({
      where: { name: 'Kantata' },
      select: { id: true, name: true },
    });

    // Try to find any active project type
    projectType ??= await this.prisma.projectType.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (!projectType) {
      // Create a "Kantata" project type
      try {
        projectType = await this.prisma.projectType.create({
          data: {
            name: 'Kantata',
            color: '#6366F1',
            description: 'Project type for assignments synced from Kantata',
            isActive: true,
          },
          select: { id: true, name: true },
        });
        this.logger.log('Created new "Kantata" project type');
      } catch (error) {
        this.logger.error(`Failed to create project type: ${error}`);
        return null;
      }
    }

    // Create the external ID mapping
    await this.externalIdMapping.create(
      SOURCE_NAME,
      PROJECT_TYPE_ENTITY_TYPE,
      KANTATA_PROJECT_TYPE_EXTERNAL_ID,
      projectType.id,
    );
    this.logger.log(`Using project type "${projectType.name}" for Kantata assignments`);

    return { ...projectType, externalId: KANTATA_PROJECT_TYPE_EXTERNAL_ID };
  }

  /**
   * Link assignments to their stories
   */
  private linkAssignmentsToStories(
    stories: KantataStory[],
    assignments: Record<string, KantataStoryAssignment>,
    users: Record<string, KantataUser>,
  ): void {
    const storyIdSet = new Set(stories.map((s) => s.id));

    stories.forEach((story) => {
      if (story.current_assignment_ids && story.current_assignment_ids.length > 0) {
        story._assignments = story.current_assignment_ids
          .map((id) => {
            const assignment = assignments[id];
            if (
              assignment &&
              storyIdSet.has(assignment.story_id) &&
              assignment.story_id === story.id
            ) {
              if (assignment.assignee_id) {
                const user = users[assignment.assignee_id];
                if (user?.full_name) {
                  assignment._assignee = user;
                  return assignment;
                }
              }
            }
            return null;
          })
          .filter((a): a is KantataStoryAssignment => a !== null);
      } else {
        story._assignments = [];
      }
    });
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
  private isStandardProject(stories: KantataStory[]): {
    isStandard: boolean;
    executionPhases: KantataStory[];
    reportingPhases: KantataStory[];
  } {
    const milestones = stories.filter(
      (s) => s.story_type === 'milestone' && s.parent_id === null,
    );

    const executionPhases = milestones.filter(
      (m) => m.title?.toLowerCase().startsWith('execution phase'),
    );
    const reportingPhases = milestones.filter(
      (m) => m.title?.toLowerCase().startsWith('reporting phase'),
    );

    return {
      isStandard: executionPhases.length > 0 && reportingPhases.length > 0,
      executionPhases,
      reportingPhases,
    };
  }

  /**
   * Detect nested projects (assessments with Execution/Reporting phases)
   */
  private detectNestedProjects(
    stories: KantataStory[],
  ): Array<{
    assessment: KantataStory;
    executionPhases: KantataStory[];
    reportingPhases: KantataStory[];
  }> {
    const topLevelItems = stories.filter((s) => s.parent_id === null);
    const assessments: Array<{
      assessment: KantataStory;
      executionPhases: KantataStory[];
      reportingPhases: KantataStory[];
    }> = [];

    topLevelItems.forEach((item) => {
      const childMilestones = stories.filter(
        (s) => s.story_type === 'milestone' && s.parent_id === item.id,
      );

      const executionPhases = childMilestones.filter(
        (m) => m.title?.toLowerCase().startsWith('execution phase'),
      );
      const reportingPhases = childMilestones.filter(
        (m) => m.title?.toLowerCase().startsWith('reporting phase'),
      );

      if (executionPhases.length > 0 && reportingPhases.length > 0) {
        assessments.push({
          assessment: item,
          executionPhases,
          reportingPhases,
        });
      }
    });

    return assessments;
  }

  /**
   * Process a milestone to extract assignees
   */
  private processMilestone(
    milestone: KantataStory,
    stories: KantataStory[],
  ): KantataProcessedPhase {
    const tasks = stories.filter(
      (s) =>
        s.story_type === 'task' &&
        s.parent_id === milestone.id &&
        s.title !== 'QA',
    );

    const assigneeMap = new Map<
      string,
      { name: string; userId: string; roles: Set<string> }
    >();

    tasks.forEach((task) => {
      if (task._assignments?.length) {
        task._assignments.forEach((assignment) => {
          if (assignment._assignee?.full_name) {
            const userId = assignment._assignee.id;
            const userName = assignment._assignee.full_name;
            const role = task.title;

            if (!assigneeMap.has(userId)) {
              assigneeMap.set(userId, {
                name: userName,
                userId,
                roles: new Set(),
              });
            }

            assigneeMap.get(userId)!.roles.add(role);
          }
        });
      }
    });

    const assignees: KantataProcessedAssignee[] = Array.from(
      assigneeMap.values(),
    ).map((entry) => ({
      name: entry.name,
      userId: entry.userId,
      roles: Array.from(entry.roles).join(', '),
    }));

    return {
      title: milestone.title,
      storyId: milestone.id,
      start_date: milestone.start_date,
      due_date: milestone.due_date,
      assignees,
    };
  }

  /**
   * Process workspaces into projects
   */
  private processWorkspaces(
    storiesByWorkspace: Record<string, KantataStory[]>,
    workspaces: Record<string, KantataWorkspace>,
  ): KantataProcessedProject[] {
    const processedProjects: KantataProcessedProject[] = [];
    const processedWorkspaceIds = new Set<string>();

    // First pass: Process standard projects
    Object.entries(storiesByWorkspace).forEach(([workspaceId, stories]) => {
      const workspace = workspaces[workspaceId];
      if (!workspace) return;

      // Skip cancelled projects
      if (workspace.status?.message?.toLowerCase() === 'cancelled') {
        this.logger.debug(`Skipping cancelled project: ${workspace.title}`);
        return;
      }

      const projectInfo = this.isStandardProject(stories);

      if (projectInfo.isStandard) {
        const executionPhases = projectInfo.executionPhases
          .map((phase) => this.processMilestone(phase, stories))
          .filter((p) => !this.shouldFilterPhase(p.title));

        const reportingPhases = projectInfo.reportingPhases
          .map((phase) => this.processMilestone(phase, stories))
          .filter((p) => !this.shouldFilterPhase(p.title));

        if (executionPhases.length > 0 || reportingPhases.length > 0) {
          processedProjects.push({
            title: workspace.title,
            workspaceId,
            start_date: workspace.start_date,
            due_date: workspace.due_date,
            executionPhases,
            reportingPhases,
          });
          processedWorkspaceIds.add(workspaceId);
        }
      }
    });

    // Second pass: Process nested projects
    Object.entries(storiesByWorkspace).forEach(([workspaceId, stories]) => {
      if (processedWorkspaceIds.has(workspaceId)) return;

      const workspace = workspaces[workspaceId];
      if (!workspace) return;

      if (workspace.status?.message?.toLowerCase() === 'cancelled') {
        return;
      }

      const nestedAssessments = this.detectNestedProjects(stories);

      if (nestedAssessments.length > 0) {
        const assessments = nestedAssessments.map((assessment) => ({
          assessment: {
            title: assessment.assessment.title,
            storyId: assessment.assessment.id,
            start_date: assessment.assessment.start_date,
            due_date: assessment.assessment.due_date,
          },
          executionPhases: assessment.executionPhases
            .map((phase) => this.processMilestone(phase, stories))
            .filter((p) => !this.shouldFilterPhase(p.title)),
          reportingPhases: assessment.reportingPhases
            .map((phase) => this.processMilestone(phase, stories))
            .filter((p) => !this.shouldFilterPhase(p.title)),
        }));

        processedProjects.push({
          title: workspace.title,
          workspaceId,
          start_date: workspace.start_date,
          due_date: workspace.due_date,
          assessments,
        });
        processedWorkspaceIds.add(workspaceId);
      }
    });

    return processedProjects;
  }

  /**
   * Check if a phase should be filtered out
   */
  private shouldFilterPhase(title: string): boolean {
    if (!title) return false;
    return PHASES_TO_FILTER.has(title.toLowerCase());
  }

  /**
   * Transform processed projects to IngestionAssignment format
   */
  private async transformToIngestionAssignments(
    projects: KantataProcessedProject[],
    projectTypeId: string,
  ): Promise<IngestionAssignment[]> {
    const assignments: IngestionAssignment[] = [];

    for (const project of projects) {
      const projectAssignments = await this.transformProjectToAssignments(
        project,
        projectTypeId,
      );
      assignments.push(...projectAssignments);
    }

    return assignments;
  }

  /**
   * Transform a single project into assignments
   */
  private async transformProjectToAssignments(
    project: KantataProcessedProject,
    projectTypeId: string,
  ): Promise<IngestionAssignment[]> {
    const assignments: IngestionAssignment[] = [];

    // Process standard project phases
    if (project.executionPhases) {
      const phaseAssignments = await this.processPhases(
        project,
        project.executionPhases,
        'execution',
        projectTypeId,
      );
      assignments.push(...phaseAssignments);
    }

    if (project.reportingPhases) {
      const phaseAssignments = await this.processPhases(
        project,
        project.reportingPhases,
        'reporting',
        projectTypeId,
      );
      assignments.push(...phaseAssignments);
    }

    // Process nested project assessments
    if (project.assessments) {
      const assessmentAssignments = await this.processAssessments(
        project,
        project.assessments,
        projectTypeId,
      );
      assignments.push(...assessmentAssignments);
    }

    return assignments;
  }

  /**
   * Process phases and return assignments
   */
  private async processPhases(
    project: KantataProcessedProject,
    phases: KantataProcessedPhase[],
    phaseType: string,
    projectTypeId: string,
    assessmentTitle?: string,
  ): Promise<IngestionAssignment[]> {
    const assignments: IngestionAssignment[] = [];

    for (const phase of phases) {
      const assignment = await this.createAssignmentFromPhase(
        project,
        phase,
        phaseType,
        projectTypeId,
        assessmentTitle,
      );
      if (assignment) {
        assignments.push(assignment);
      }
    }

    return assignments;
  }

  /**
   * Process nested assessments and return assignments
   */
  private async processAssessments(
    project: KantataProcessedProject,
    assessments: Array<{
      assessment: { title: string; storyId: string; start_date?: string; due_date?: string };
      executionPhases: KantataProcessedPhase[];
      reportingPhases: KantataProcessedPhase[];
    }>,
    projectTypeId: string,
  ): Promise<IngestionAssignment[]> {
    const assignments: IngestionAssignment[] = [];

    for (const assessment of assessments) {
      const executionAssignments = await this.processPhases(
        project,
        assessment.executionPhases,
        'execution',
        projectTypeId,
        assessment.assessment.title,
      );
      assignments.push(...executionAssignments);

      const reportingAssignments = await this.processPhases(
        project,
        assessment.reportingPhases,
        'reporting',
        projectTypeId,
        assessment.assessment.title,
      );
      assignments.push(...reportingAssignments);
    }

    return assignments;
  }

  /**
   * Create an IngestionAssignment from a processed phase
   */
  private async createAssignmentFromPhase(
    project: KantataProcessedProject,
    phase: KantataProcessedPhase,
    phaseType: string,
    projectTypeExternalId: string,
    assessmentTitle?: string,
  ): Promise<IngestionAssignment | null> {
    // Skip phases without dates
    if (!phase.start_date || !phase.due_date) {
      this.logger.debug(
        `Skipping phase ${phase.title} - missing dates`,
      );
      return null;
    }

    // Resolve member external IDs and ensure mappings exist under our source
    const memberExternalIds: string[] = [];
    for (const assignee of phase.assignees) {
      // Check if this user has been synced via members sync
      const memberMapping = await this.externalIdMapping.find(
        MEMBER_SOURCE_NAME,
        MEMBER_ENTITY_TYPE,
        assignee.userId,
      );

      if (memberMapping) {
        // Also ensure a mapping exists under our source for the ingestion processor
        const ourMapping = await this.externalIdMapping.find(
          SOURCE_NAME,
          MEMBER_ENTITY_TYPE,
          assignee.userId,
        );
        if (!ourMapping) {
          await this.externalIdMapping.create(
            SOURCE_NAME,
            MEMBER_ENTITY_TYPE,
            assignee.userId,
            memberMapping,
          );
        }
        memberExternalIds.push(assignee.userId);
      } else {
        this.logger.debug(
          `Assignee ${assignee.name} (${assignee.userId}) not found in member mappings`,
        );
      }
    }

    // Skip if no valid assignees
    if (memberExternalIds.length === 0) {
      this.logger.debug(
        `Skipping phase ${phase.title} - no valid assignees`,
      );
      return null;
    }

    const title = assessmentTitle
      ? `${project.title} - ${assessmentTitle} - ${phase.title}`
      : `${project.title} - ${phase.title}`;

    return {
      externalId: phase.storyId,
      title,
      description: `${phaseType.charAt(0).toUpperCase() + phaseType.slice(1)} phase for ${project.title}`,
      startDate: phase.start_date,
      endDate: phase.due_date,
      projectTypeExternalId,
      memberExternalIds,
      requestExternalId: project.workspaceId,
      metadata: {
        kantataWorkspaceId: project.workspaceId,
        kantataStoryId: phase.storyId,
        phaseType,
        projectTitle: project.title,
        assessmentTitle,
        assigneeRoles: phase.assignees.map((a) => ({
          name: a.name,
          roles: a.roles,
        })),
      },
    };
  }

  /**
   * Resolve overlapping assignment dates per member.
   *
   * When multiple assignments overlap for the same member, later-starting
   * assignments take priority. Earlier assignments have their end dates
   * trimmed to the day before the next assignment starts.
   *
   * Multi-member assignments are decomposed into single-member assignments
   * first, since overlap resolution may produce different date ranges for
   * different members.
   */
  private resolveOverlappingAssignments(
    assignments: IngestionAssignment[],
  ): IngestionAssignment[] {
    if (assignments.length <= 1) {
      return assignments.length === 1
        ? this.toIngestionAssignments(this.decomposeToPerMember(assignments))
        : assignments;
    }

    // Step 1: Decompose into per-member assignments
    const perMember = this.decomposeToPerMember(assignments);

    // Step 2: Group by member ID
    const byMember = new Map<string, PerMemberAssignment[]>();
    for (const pm of perMember) {
      const list = byMember.get(pm.memberId) || [];
      list.push(pm);
      byMember.set(pm.memberId, list);
    }

    // Step 3: Resolve overlaps within each member group
    const resolved: PerMemberAssignment[] = [];
    for (const [memberId, memberAssignments] of byMember) {
      const resolvedForMember = this.resolveOverlapsForMember(
        memberId,
        memberAssignments,
      );
      resolved.push(...resolvedForMember);
    }

    // Step 4: Convert back to IngestionAssignment[]
    return this.toIngestionAssignments(resolved);
  }

  /**
   * Decompose multi-member assignments into individual per-member entries.
   */
  private decomposeToPerMember(
    assignments: IngestionAssignment[],
  ): PerMemberAssignment[] {
    const result: PerMemberAssignment[] = [];

    for (const assignment of assignments) {
      for (const memberId of assignment.memberExternalIds) {
        result.push({
          original: assignment,
          memberId,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
        });
      }
    }

    return result;
  }

  /**
   * Apply the overlap resolution algorithm for a single member's assignments.
   *
   * Sort by startDate ascending. Sweep backward (latest first).
   * Maintain the earliest blocking date. Trim each assignment's endDate
   * to dayBefore(earliestBlockingDate) if it overlaps. Discard assignments
   * that are fully consumed (endDate < startDate after trimming).
   */
  private resolveOverlapsForMember(
    memberId: string,
    assignments: PerMemberAssignment[],
  ): PerMemberAssignment[] {
    if (assignments.length <= 1) return assignments;

    // Sort by startDate ASC, then endDate DESC for tie-breaking
    const sorted = [...assignments].sort((a, b) => {
      const startCmp = a.startDate.localeCompare(b.startDate);
      if (startCmp !== 0) return startCmp;
      return b.endDate.localeCompare(a.endDate); // DESC
    });

    const result: PerMemberAssignment[] = [];
    let earliestBlockingDate: string | null = null;

    for (let i = sorted.length - 1; i >= 0; i--) {
      const entry = sorted[i];
      if (!entry) continue;

      const assignment: PerMemberAssignment = {
        original: entry.original,
        memberId: entry.memberId,
        startDate: entry.startDate,
        endDate: entry.endDate,
      };

      if (
        earliestBlockingDate !== null &&
        assignment.endDate >= earliestBlockingDate
      ) {
        const trimmedEnd = dayBefore(earliestBlockingDate);
        this.logger.debug(
          `Overlap resolution for member ${memberId}: trimming "${assignment.original.title}" ` +
            `endDate from ${assignment.endDate} to ${trimmedEnd}`,
        );
        assignment.endDate = trimmedEnd;
      }

      if (assignment.startDate > assignment.endDate) {
        this.logger.debug(
          `Overlap resolution for member ${memberId}: fully consumed "${assignment.original.title}" ` +
            `(${assignment.startDate} > ${assignment.endDate}), discarding`,
        );
        continue;
      }

      result.push(assignment);

      if (
        earliestBlockingDate === null ||
        assignment.startDate < earliestBlockingDate
      ) {
        earliestBlockingDate = assignment.startDate;
      }
    }

    result.reverse();
    return result;
  }

  /**
   * Convert resolved per-member assignments back to IngestionAssignment[].
   * Each gets a unique externalId derived from the original + member ID.
   */
  private toIngestionAssignments(
    perMember: PerMemberAssignment[],
  ): IngestionAssignment[] {
    return perMember.map((pm) => ({
      externalId: `${pm.original.externalId}::member::${pm.memberId}`,
      title: pm.original.title,
      description: pm.original.description,
      startDate: pm.startDate,
      endDate: pm.endDate,
      projectTypeExternalId: pm.original.projectTypeExternalId,
      memberExternalIds: [pm.memberId],
      requestExternalId: pm.original.requestExternalId,
      metadata: {
        ...(pm.original.metadata as Record<string, unknown>),
        originalExternalId: pm.original.externalId,
        overlapResolved:
          pm.startDate !== pm.original.startDate ||
          pm.endDate !== pm.original.endDate,
      },
    }));
  }
}
