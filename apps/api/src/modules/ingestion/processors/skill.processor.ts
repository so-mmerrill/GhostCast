import { Injectable } from '@nestjs/common';
import {
  IngestionRecordResult,
  IngestionRecordStatus,
  IngestionSkill,
  ProcessingContext,
} from '@ghostcast/shared';
import { BaseProcessor } from './base.processor';
import { PrismaTransaction } from './processor.interface';
import { ExternalIdMappingService } from '../services/external-id-mapping.service';

@Injectable()
export class SkillProcessor extends BaseProcessor<IngestionSkill> {
  constructor(mappingService: ExternalIdMappingService) {
    super('Skill', mappingService);
  }

  protected async findByNaturalKey(
    tx: PrismaTransaction,
    item: IngestionSkill,
  ): Promise<string | null> {
    // Skills use name as natural key
    const existing = await tx.skill.findUnique({
      where: { name: item.name },
    });
    return existing?.id ?? null;
  }

  protected async verifyRecordExists(
    tx: PrismaTransaction,
    existingId: string,
  ): Promise<boolean> {
    const skill = await tx.skill.findUnique({
      where: { id: existingId },
      select: { id: true },
    });
    return skill !== null;
  }

  protected async createRecord(
    tx: PrismaTransaction,
    item: IngestionSkill,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    if (context.dryRun) {
      return {
        externalId: item.externalId,
        status: IngestionRecordStatus.CREATED,
      };
    }

    const created = await tx.skill.create({
      data: {
        name: item.name,
        category: item.category,
        description: item.description,
        externalId: item.externalId,
      },
    });

    // Store the mapping
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
    item: IngestionSkill,
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

    await tx.skill.update({
      where: { id: existingId },
      data: {
        name: item.name,
        category: item.category,
        description: item.description,
        externalId: item.externalId,
      },
    });

    // Ensure mapping exists
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
    data: IngestionSkill[],
    context: ProcessingContext,
  ): Promise<string[]> {
    const errors = await super.validate(data, context);

    for (const item of data) {
      if (!item.name || item.name.trim().length === 0) {
        errors.push(`Skill ${item.externalId}: name is required`);
      }
    }

    return errors;
  }
}
