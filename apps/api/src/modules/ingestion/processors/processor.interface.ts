import {
  IngestionEntityResult,
  ProcessingContext,
} from '@ghostcast/shared';
import { PrismaClient } from '@ghostcast/database';

/**
 * Prisma transaction type for use in processors
 * This represents the transaction client passed to $transaction callbacks
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Interface for entity processors
 * Each entity type (Member, Skill, etc.) has a dedicated processor
 */
export interface EntityProcessor<T> {
  /**
   * The entity type name (used for reporting and ID mapping)
   */
  readonly entityType: string;

  /**
   * Process an array of entity data
   * @param tx - Prisma transaction
   * @param data - Array of entity data to process
   * @param context - Processing context with options and ID map
   * @returns Result of processing this entity type
   */
  process(
    tx: PrismaTransaction,
    data: T[],
    context: ProcessingContext,
  ): Promise<IngestionEntityResult>;

  /**
   * Validate entity data (for dry-run mode)
   * @param data - Array of entity data to validate
   * @param context - Processing context
   * @returns Array of validation error messages
   */
  validate(data: T[], context: ProcessingContext): Promise<string[]>;
}
