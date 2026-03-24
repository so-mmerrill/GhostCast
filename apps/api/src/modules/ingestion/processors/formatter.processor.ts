import { Injectable } from '@nestjs/common';
import {
  IngestionRecordResult,
  IngestionRecordStatus,
  IngestionFormatter,
  ProcessingContext,
} from '@ghostcast/shared';
import { BaseProcessor } from './base.processor';
import { PrismaTransaction } from './processor.interface';
import { ExternalIdMappingService } from '../services/external-id-mapping.service';

@Injectable()
export class FormatterProcessor extends BaseProcessor<IngestionFormatter> {
  constructor(mappingService: ExternalIdMappingService) {
    super('Formatter', mappingService);
  }

  protected async findByNaturalKey(
    tx: PrismaTransaction,
    item: IngestionFormatter,
  ): Promise<string | null> {
    // Formatters use name as natural key
    const existing = await tx.formatter.findUnique({
      where: { name: item.name },
    });
    return existing?.id ?? null;
  }

  protected async createRecord(
    tx: PrismaTransaction,
    item: IngestionFormatter,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    if (context.dryRun) {
      return {
        externalId: item.externalId,
        status: IngestionRecordStatus.CREATED,
      };
    }

    const created = await tx.formatter.create({
      data: {
        name: item.name,
        isBold: item.isBold ?? false,
        prefix: item.prefix,
        suffix: item.suffix,
      },
    });

    await this.mappingService.upsertWithTx(
      tx,
      context.source,
      this.entityType,
      item.externalId,
      created.id,
    );

    return {
      externalId: item.externalId,
      internalId: created.id,
      status: IngestionRecordStatus.CREATED,
    };
  }

  protected async updateRecord(
    tx: PrismaTransaction,
    item: IngestionFormatter,
    existingId: string,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    if (context.dryRun) {
      return {
        externalId: item.externalId,
        internalId: existingId,
        status: IngestionRecordStatus.UPDATED,
      };
    }

    await tx.formatter.update({
      where: { id: existingId },
      data: {
        name: item.name,
        isBold: item.isBold,
        prefix: item.prefix,
        suffix: item.suffix,
      },
    });

    await this.mappingService.upsertWithTx(
      tx,
      context.source,
      this.entityType,
      item.externalId,
      existingId,
    );

    return {
      externalId: item.externalId,
      internalId: existingId,
      status: IngestionRecordStatus.UPDATED,
    };
  }

  async validate(
    data: IngestionFormatter[],
    context: ProcessingContext,
  ): Promise<string[]> {
    const errors = await super.validate(data, context);

    for (const item of data) {
      if (!item.name || item.name.trim().length === 0) {
        errors.push(`Formatter ${item.externalId}: name is required`);
      }
    }

    return errors;
  }
}
