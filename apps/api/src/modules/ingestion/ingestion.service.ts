import { Injectable, Logger } from '@nestjs/common';

class DryRunRollbackError extends Error {
  constructor(public readonly entities: IngestionEntityResult[]) {
    super('Dry run rollback');
    this.name = 'DryRunRollbackError';
  }
}
import { PrismaService } from '../../database/prisma.service';
import {
  ConflictStrategy,
  IngestionPayload,
  IngestionResult,
  IngestionEntityResult,
  IngestionSummary,
  ProcessingMode,
  ProcessingContext,
  IngestionJobStatus,
} from '@ghostcast/shared';
import { ExternalIdMappingService } from './services/external-id-mapping.service';
import { SkillProcessor } from './processors/skill.processor';
import { ProjectTypeProcessor } from './processors/project-type.processor';
import { FormatterProcessor } from './processors/formatter.processor';
import { MemberProcessor } from './processors/member.processor';
import { AssignmentProcessor } from './processors/assignment.processor';
import { RequestProcessor } from './processors/request.processor';
import { PrismaTransaction } from './processors/processor.interface';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalIdMapping: ExternalIdMappingService,
    private readonly skillProcessor: SkillProcessor,
    private readonly projectTypeProcessor: ProjectTypeProcessor,
    private readonly formatterProcessor: FormatterProcessor,
    private readonly memberProcessor: MemberProcessor,
    private readonly assignmentProcessor: AssignmentProcessor,
    private readonly requestProcessor: RequestProcessor,
  ) {}

  /**
   * Main entry point for data ingestion
   */
  async ingest(payload: IngestionPayload): Promise<IngestionResult> {
    const startedAt = new Date();
    const result: IngestionResult = {
      success: true,
      dryRun: payload.options.dryRun,
      processingMode: payload.options.processingMode,
      startedAt,
      summary: this.createEmptySummary(),
      entities: [],
      errors: [],
    };

    this.logger.log(
      `Starting ingestion from source '${payload.options.source}' (dryRun: ${payload.options.dryRun}, mode: ${payload.options.processingMode})`,
    );

    // Handle async processing
    if (payload.options.processingMode === ProcessingMode.ASYNC) {
      return this.scheduleAsyncIngestion(payload);
    }

    try {
      // Validate all data first
      const validationErrors = await this.validateAll(payload);
      if (validationErrors.length > 0) {
        result.success = false;
        result.errors = validationErrors;
        result.completedAt = new Date();
        result.duration = result.completedAt.getTime() - startedAt.getTime();
        return result;
      }

      // Process in transaction (unless dry-run, which simulates without transaction)
      if (payload.options.dryRun) {
        // For dry-run, we still use a transaction but roll it back
        result.entities = await this.prisma.$transaction(
          async (tx) => {
            const entities = await this.processAll(tx as PrismaTransaction, payload);
            // Roll back by throwing - but we catch it
            throw new DryRunRollbackError(entities);
          },
          { timeout: 60000, maxWait: 5000 },
        ).catch((e: unknown) => {
          if (e instanceof DryRunRollbackError) {
            return e.entities;
          }
          throw e;
        });
      } else {
        result.entities = await this.prisma.$transaction(
          async (tx) => this.processAll(tx as PrismaTransaction, payload),
          { timeout: 60000, maxWait: 5000 },
        );
      }

      // Aggregate summary
      this.aggregateSummary(result);

      this.logger.log(
        `Ingestion completed: ${result.summary.created} created, ${result.summary.updated} updated, ${result.summary.skipped} skipped, ${result.summary.failed} failed`,
      );
    } catch (error) {
      result.success = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
      this.logger.error(`Ingestion failed: ${errorMessage}`, error);
    }

    result.completedAt = new Date();
    result.duration = result.completedAt.getTime() - startedAt.getTime();
    return result;
  }

  /**
   * Validate all entity data before processing
   */
  private async validateAll(payload: IngestionPayload): Promise<string[]> {
    const errors: string[] = [];
    const context = this.createContext(payload);

    if (payload.data.skills) {
      errors.push(...await this.skillProcessor.validate(payload.data.skills, context));
    }
    if (payload.data.projectTypes) {
      errors.push(...await this.projectTypeProcessor.validate(payload.data.projectTypes, context));
    }
    if (payload.data.formatters) {
      errors.push(...await this.formatterProcessor.validate(payload.data.formatters, context));
    }
    if (payload.data.members) {
      errors.push(...await this.memberProcessor.validate(payload.data.members, context));
    }
    if (payload.data.assignments) {
      errors.push(...await this.assignmentProcessor.validate(payload.data.assignments, context));
    }
    if (payload.data.requests) {
      errors.push(...await this.requestProcessor.validate(payload.data.requests, context));
    }

    return errors;
  }

  /**
   * Process all entities in dependency order
   */
  private async processAll(
    tx: PrismaTransaction,
    payload: IngestionPayload,
  ): Promise<IngestionEntityResult[]> {
    const results: IngestionEntityResult[] = [];
    const context = this.createContext(payload);

    // Load existing mappings for this source into the ID map
    await this.loadExistingMappings(context);

    // Process each entity type in dependency order
    await this.processEntityType(tx, 'skills', payload.data.skills, this.skillProcessor, context, results);
    await this.processEntityType(tx, 'projectTypes', payload.data.projectTypes, this.projectTypeProcessor, context, results);
    await this.processEntityType(tx, 'formatters', payload.data.formatters, this.formatterProcessor, context, results);
    await this.processEntityType(tx, 'members', payload.data.members, this.memberProcessor, context, results);
    await this.processEntityType(tx, 'assignments', payload.data.assignments, this.assignmentProcessor, context, results);
    await this.processEntityType(tx, 'requests', payload.data.requests, this.requestProcessor, context, results);

    return results;
  }

  /**
   * Process a single entity type
   */
  private async processEntityType<T extends { externalId: string }>(
    tx: PrismaTransaction,
    entityName: string,
    data: T[] | undefined,
    processor: { process: (tx: PrismaTransaction, data: T[], context: ProcessingContext) => Promise<IngestionEntityResult> },
    context: ProcessingContext,
    results: IngestionEntityResult[],
  ): Promise<void> {
    if (!data || data.length === 0) {
      return;
    }

    this.logger.debug(`Processing ${data.length} ${entityName}`);
    const result = await processor.process(tx, data, context);
    results.push(result);

    if (!context.continueOnError && result.failed > 0) {
      throw new Error(`Failed to process ${entityName}: ${result.failed} failures`);
    }
  }

  /**
   * Load existing external ID mappings for this source
   */
  private async loadExistingMappings(context: ProcessingContext): Promise<void> {
    const mappings = await this.externalIdMapping.findBySource(context.source);
    for (const mapping of mappings) {
      context.idMap.set(
        `${mapping.entityType}:${mapping.externalId}`,
        mapping.internalId,
      );
    }
    this.logger.debug(`Loaded ${mappings.length} existing mappings for source '${context.source}'`);
  }

  /**
   * Create a processing context from the payload
   */
  private createContext(payload: IngestionPayload): ProcessingContext {
    return {
      source: payload.options.source,
      conflictStrategy: payload.options.conflictStrategy ?? ConflictStrategy.SKIP,
      continueOnError: payload.options.continueOnError ?? true,
      idMap: new Map<string, string>(),
      dryRun: payload.options.dryRun,
    };
  }

  /**
   * Schedule an async ingestion job
   */
  private async scheduleAsyncIngestion(
    payload: IngestionPayload,
  ): Promise<IngestionResult> {
    const job = await this.prisma.ingestionJob.create({
      data: {
        source: payload.options.source,
        triggeredBy: payload.options.triggeredBy,
        payload: payload as object,
        status: 'PENDING',
      },
    });

    this.logger.log(`Scheduled async ingestion job ${job.id}`);

    // Process in background (fire and forget)
    this.processJobAsync(job.id).catch((error) => {
      this.logger.error(`Async job ${job.id} failed: ${error.message}`);
    });

    return {
      success: true,
      dryRun: false,
      processingMode: ProcessingMode.ASYNC,
      jobId: job.id,
      startedAt: new Date(),
      summary: this.createEmptySummary(),
      entities: [],
      errors: [],
    };
  }

  /**
   * Process an async job
   */
  private async processJobAsync(jobId: string): Promise<void> {
    await this.prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    const job = await this.prisma.ingestionJob.findUnique({
      where: { id: jobId },
    });

    if (!job) return;

    try {
      const payload = job.payload as unknown as IngestionPayload;
      // Force sync mode for actual processing
      payload.options.processingMode = ProcessingMode.SYNC;

      const result = await this.ingest(payload);

      await this.prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          status: result.success ? 'COMPLETED' : 'FAILED',
          result: result as object,
          progress: 100,
          completedAt: new Date(),
          errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Aggregate entity results into the summary
   */
  private aggregateSummary(result: IngestionResult): void {
    for (const entity of result.entities) {
      result.summary.totalRecords += entity.total;
      result.summary.created += entity.created;
      result.summary.updated += entity.updated;
      result.summary.skipped += entity.skipped;
      result.summary.failed += entity.failed;
    }

    // Mark as failed if any records failed
    if (result.summary.failed > 0) {
      result.success = false;
    }
  }

  /**
   * Create an empty summary object
   */
  private createEmptySummary(): IngestionSummary {
    return {
      totalRecords: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
  }

  // ===================================
  // Query Methods
  // ===================================

  /**
   * List ingestion jobs
   */
  async listJobs(filter?: { status?: IngestionJobStatus; source?: string }) {
    const where: { status?: IngestionJobStatus; source?: string } = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.source) where.source = filter.source;

    return this.prisma.ingestionJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Get a specific job
   */
  async getJob(id: string) {
    return this.prisma.ingestionJob.findUnique({
      where: { id },
    });
  }

  /**
   * Get external ID mappings
   */
  async getMappings(source: string, entityType?: string) {
    return this.externalIdMapping.findBySource(source, entityType);
  }

  /**
   * Clear all mappings for a source
   */
  async clearMappings(source: string): Promise<number> {
    const count = await this.externalIdMapping.deleteBySource(source);
    this.logger.log(`Cleared ${count} mappings for source '${source}'`);
    return count;
  }
}
