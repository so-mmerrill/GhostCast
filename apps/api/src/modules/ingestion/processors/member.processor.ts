import { Injectable } from '@nestjs/common';
import {
  IngestionRecordResult,
  IngestionRecordStatus,
  IngestionMember,
  ProcessingContext,
} from '@ghostcast/shared';
import { BaseProcessor } from './base.processor';
import { PrismaTransaction } from './processor.interface';
import { ExternalIdMappingService } from '../services/external-id-mapping.service';

@Injectable()
export class MemberProcessor extends BaseProcessor<IngestionMember> {
  constructor(mappingService: ExternalIdMappingService) {
    super('Member', mappingService);
  }

  protected async findByNaturalKey(
    tx: PrismaTransaction,
    item: IngestionMember,
  ): Promise<string | null> {
    // Members use employeeId as natural key (if provided)
    if (item.employeeId) {
      const existing = await tx.member.findUnique({
        where: { employeeId: item.employeeId },
      });
      return existing?.id ?? null;
    }
    return null;
  }

  protected async createRecord(
    tx: PrismaTransaction,
    item: IngestionMember,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    if (context.dryRun) {
      return {
        externalId: item.externalId,
        status: IngestionRecordStatus.CREATED,
      };
    }

    const created = await tx.member.create({
      data: {
        employeeId: item.employeeId,
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        phone: item.phone,
        department: item.department,
        position: item.position,
        workingHours: item.workingHours as object,
        metadata: (item.metadata as object) ?? {},
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

    // Handle skill associations
    if (item.skillExternalIds && item.skillExternalIds.length > 0) {
      await this.updateMemberSkills(
        tx,
        created.id,
        item.skillExternalIds,
        item.skillLevels,
        context,
      );
    }

    return {
      externalId: item.externalId,
      internalId: created.id,
      status: IngestionRecordStatus.CREATED,
    };
  }

  protected async updateRecord(
    tx: PrismaTransaction,
    item: IngestionMember,
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

    // Get existing member for metadata merge
    const existing = await tx.member.findUnique({
      where: { id: existingId },
    });

    // If the member doesn't exist (orphaned mapping), create it instead
    if (!existing) {
      return this.createRecord(tx, item, context);
    }

    await tx.member.update({
      where: { id: existingId },
      data: {
        employeeId: item.employeeId,
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        phone: item.phone,
        department: item.department,
        position: item.position,
        workingHours: item.workingHours as object,
        metadata: {
          ...(existing.metadata as object),
          ...(item.metadata as object),
        },
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

    // Handle skill associations if provided
    if (item.skillExternalIds !== undefined) {
      await this.updateMemberSkills(
        tx,
        existingId,
        item.skillExternalIds,
        item.skillLevels,
        context,
      );
    }

    return {
      externalId: item.externalId,
      internalId: existingId,
      status: IngestionRecordStatus.UPDATED,
    };
  }

  private async updateMemberSkills(
    tx: PrismaTransaction,
    memberId: string,
    skillExternalIds: string[],
    skillLevels: number[] | undefined,
    context: ProcessingContext,
  ): Promise<void> {
    // Resolve skill IDs from context
    const skillIds = this.mappingService.resolveFromContext(
      context.idMap,
      'Skill',
      skillExternalIds,
    );

    if (skillIds.length === 0) return;

    // Verify resolved skill IDs actually exist in the database
    // (mappings can become stale if skills were deleted)
    const existingSkills = await tx.skill.findMany({
      where: { id: { in: skillIds } },
      select: { id: true },
    });
    const validSkillIds = new Set(existingSkills.map((s) => s.id));
    const verifiedSkillIds = skillIds.filter((id) => validSkillIds.has(id));

    if (verifiedSkillIds.length === 0) return;

    // Delete existing skills
    await tx.memberSkill.deleteMany({ where: { memberId } });

    // Create new skill associations
    await tx.memberSkill.createMany({
      data: verifiedSkillIds.map((skillId, index) => ({
        memberId,
        skillId,
        level: skillLevels?.[index] ?? 1,
      })),
    });
  }

  async validate(
    data: IngestionMember[],
    context: ProcessingContext,
  ): Promise<string[]> {
    const errors = await super.validate(data, context);

    for (const item of data) {
      if (!item.firstName || item.firstName.trim().length === 0) {
        errors.push(`Member ${item.externalId}: firstName is required`);
      }
      if (!item.lastName || item.lastName.trim().length === 0) {
        errors.push(`Member ${item.externalId}: lastName is required`);
      }
      if (item.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) {
        errors.push(`Member ${item.externalId}: invalid email format`);
      }
    }

    return errors;
  }
}
