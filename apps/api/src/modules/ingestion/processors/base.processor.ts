import { ConflictException, Logger } from '@nestjs/common';
import {
  ConflictStrategy,
  IngestionEntityResult,
  IngestionRecordResult,
  IngestionRecordStatus,
  ProcessingContext,
} from '@ghostcast/shared';
import { EntityProcessor, PrismaTransaction } from './processor.interface';
import { ExternalIdMappingService } from '../services/external-id-mapping.service';

/**
 * Abstract base processor with common functionality
 */
export abstract class BaseProcessor<T extends { externalId: string }>
  implements EntityProcessor<T>
{
  protected readonly logger: Logger;

  constructor(
    public readonly entityType: string,
    protected readonly mappingService: ExternalIdMappingService,
  ) {
    this.logger = new Logger(`${entityType}Processor`);
  }

  async process(
    tx: PrismaTransaction,
    data: T[],
    context: ProcessingContext,
  ): Promise<IngestionEntityResult> {
    const result: IngestionEntityResult = {
      entity: this.entityType,
      total: data.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      records: [],
    };

    for (let i = 0; i < data.length; i++) {
      const item = data[i]!;
      const savepointName = `sp_${this.entityType}_${i}`;

      try {
        await this.processItemWithSavepoint(tx, item, savepointName, context, result);
      } catch (error) {
        await this.handleProcessingError(tx, item, savepointName, error, context, result);
      }
    }

    return result;
  }

  private async processItemWithSavepoint(
    tx: PrismaTransaction,
    item: T,
    savepointName: string,
    context: ProcessingContext,
    result: IngestionEntityResult,
  ): Promise<void> {
    await tx.$executeRawUnsafe(`SAVEPOINT "${savepointName}"`);

    const recordResult = await this.processOne(tx, item, context);

    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT "${savepointName}"`);

    result.records.push(recordResult);

    if (recordResult.internalId) {
      context.idMap.set(
        `${this.entityType}:${item.externalId}`,
        recordResult.internalId,
      );
    }

    this.updateResultCounts(result, recordResult.status);
  }

  private updateResultCounts(
    result: IngestionEntityResult,
    status: IngestionRecordStatus,
  ): void {
    switch (status) {
      case IngestionRecordStatus.CREATED:
        result.created++;
        break;
      case IngestionRecordStatus.UPDATED:
        result.updated++;
        break;
      case IngestionRecordStatus.SKIPPED:
        result.skipped++;
        break;
      case IngestionRecordStatus.FAILED:
        result.failed++;
        break;
    }
  }

  private async handleProcessingError(
    tx: PrismaTransaction,
    item: T,
    savepointName: string,
    error: unknown,
    context: ProcessingContext,
    result: IngestionEntityResult,
  ): Promise<void> {
    try {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT "${savepointName}"`);
    } catch {
      // If rollback fails, we can't recover — propagate the original error
    }

    result.failed++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.records.push({
      externalId: item.externalId,
      status: IngestionRecordStatus.FAILED,
      error: errorMessage,
    });

    this.logger.error(
      `Failed to process ${this.entityType} ${item.externalId}: ${errorMessage}`,
    );

    if (!context.continueOnError) {
      throw error;
    }
  }

  /**
   * Process a single record
   */
  protected async processOne(
    tx: PrismaTransaction,
    item: T,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    // Check for existing mapping
    const existingInternalId = await this.mappingService.findWithTx(
      tx,
      context.source,
      this.entityType,
      item.externalId,
    );

    // Also check by natural key if applicable
    const existingByNaturalKey = await this.findByNaturalKey(tx, item);

    const existingId = existingInternalId || existingByNaturalKey;

    if (existingId) {
      return this.handleConflict(tx, item, existingId, context);
    }

    // Create new record
    return this.createRecord(tx, item, context);
  }

  /**
   * Handle a conflict based on the configured strategy
   */
  protected async handleConflict(
    tx: PrismaTransaction,
    item: T,
    existingId: string,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    // Verify the record actually exists (mapping might be stale)
    const recordExists = await this.verifyRecordExists(tx, existingId);
    if (!recordExists) {
      this.logger.warn(
        `Stale mapping found for ${this.entityType} ${item.externalId} -> ${existingId}. Creating new record.`,
      );
      // Clean up the stale mapping
      await this.mappingService.deleteWithTx(
        tx,
        context.source,
        this.entityType,
        item.externalId,
      );
      // Create a new record
      return this.createRecord(tx, item, context);
    }

    switch (context.conflictStrategy) {
      case ConflictStrategy.FAIL:
        throw new ConflictException(
          `${this.entityType} with externalId '${item.externalId}' already exists`,
        );

      case ConflictStrategy.UPDATE:
        return this.updateRecord(tx, item, existingId, context);

      case ConflictStrategy.SKIP:
      default:
        return {
          externalId: item.externalId,
          internalId: existingId,
          status: IngestionRecordStatus.SKIPPED,
        };
    }
  }

  /**
   * Verify that a record with the given ID exists
   * Override in subclasses to implement entity-specific check
   */
  protected async verifyRecordExists(
    _tx: PrismaTransaction,
    _existingId: string,
  ): Promise<boolean> {
    // Default implementation assumes record exists
    // Subclasses should override this to verify
    return true;
  }

  /**
   * Find existing record by natural key (e.g., email, employeeId)
   * Override in subclasses if the entity has a natural key
   */
  protected abstract findByNaturalKey(
    tx: PrismaTransaction,
    item: T,
  ): Promise<string | null>;

  /**
   * Create a new record
   */
  protected abstract createRecord(
    tx: PrismaTransaction,
    item: T,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult>;

  /**
   * Update an existing record
   */
  protected abstract updateRecord(
    tx: PrismaTransaction,
    item: T,
    existingId: string,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult>;

  /**
   * Validate data (default implementation - override for specific validation)
   */
  async validate(data: T[], _context: ProcessingContext): Promise<string[]> {
    const errors: string[] = [];

    for (const item of data) {
      if (!item.externalId) {
        errors.push(`${this.entityType}: Missing externalId`);
      }
    }

    return errors;
  }
}
