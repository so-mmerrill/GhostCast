import { Injectable } from '@nestjs/common';
import {
  IngestionRecordResult,
  IngestionRecordStatus,
  IngestionProjectType,
  ProcessingContext,
} from '@ghostcast/shared';
import { BaseProcessor } from './base.processor';
import { PrismaTransaction } from './processor.interface';
import { ExternalIdMappingService } from '../services/external-id-mapping.service';

@Injectable()
export class ProjectTypeProcessor extends BaseProcessor<IngestionProjectType> {
  constructor(mappingService: ExternalIdMappingService) {
    super('ProjectType', mappingService);
  }

  protected async findByNaturalKey(
    tx: PrismaTransaction,
    item: IngestionProjectType,
  ): Promise<string | null> {
    // ProjectTypes use name as natural key
    const existing = await tx.projectType.findUnique({
      where: { name: item.name },
    });
    return existing?.id ?? null;
  }

  protected async createRecord(
    tx: PrismaTransaction,
    item: IngestionProjectType,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    if (context.dryRun) {
      return {
        externalId: item.externalId,
        status: IngestionRecordStatus.CREATED,
      };
    }

    const created = await tx.projectType.create({
      data: {
        name: item.name,
        color: item.color ?? '#3B82F6',
        description: item.description,
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
    item: IngestionProjectType,
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

    await tx.projectType.update({
      where: { id: existingId },
      data: {
        name: item.name,
        color: item.color,
        description: item.description,
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
    data: IngestionProjectType[],
    context: ProcessingContext,
  ): Promise<string[]> {
    const errors = await super.validate(data, context);

    for (const item of data) {
      if (!item.name || item.name.trim().length === 0) {
        errors.push(`ProjectType ${item.externalId}: name is required`);
      }
    }

    return errors;
  }
}
