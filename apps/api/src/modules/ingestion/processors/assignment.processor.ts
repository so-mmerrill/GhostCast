import { Injectable } from '@nestjs/common';
import {
  IngestionRecordResult,
  IngestionRecordStatus,
  IngestionAssignment,
  ProcessingContext,
  AssignmentStatus,
} from '@ghostcast/shared';
import { BaseProcessor } from './base.processor';
import { PrismaTransaction } from './processor.interface';
import { ExternalIdMappingService } from '../services/external-id-mapping.service';

@Injectable()
export class AssignmentProcessor extends BaseProcessor<IngestionAssignment> {
  constructor(mappingService: ExternalIdMappingService) {
    super('Assignment', mappingService);
  }

  protected async findByNaturalKey(
    _tx: PrismaTransaction,
    _item: IngestionAssignment,
  ): Promise<string | null> {
    // Assignments don't have a natural key
    return null;
  }

  protected async verifyRecordExists(
    tx: PrismaTransaction,
    existingId: string,
  ): Promise<boolean> {
    const record = await tx.assignment.findUnique({
      where: { id: existingId },
      select: { id: true },
    });
    return record !== null;
  }

  protected async createRecord(
    tx: PrismaTransaction,
    item: IngestionAssignment,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    // Resolve project type ID
    const projectTypeId = context.idMap.get(
      `ProjectType:${item.projectTypeExternalId}`,
    );
    if (!projectTypeId) {
      throw new Error(
        `Assignment ${item.externalId}: Unknown projectTypeExternalId '${item.projectTypeExternalId}'`,
      );
    }

    // Resolve member IDs
    const memberIds = this.mappingService.resolveFromContext(
      context.idMap,
      'Member',
      item.memberExternalIds,
    );
    if (memberIds.length === 0 && item.memberExternalIds.length > 0) {
      throw new Error(
        `Assignment ${item.externalId}: Could not resolve any member IDs`,
      );
    }

    // Resolve request ID (optional)
    const requestId = item.requestExternalId
      ? context.idMap.get(`Request:${item.requestExternalId}`)
      : undefined;

    if (context.dryRun) {
      return {
        externalId: item.externalId,
        status: IngestionRecordStatus.CREATED,
      };
    }

    // Resolve skill IDs (optional)
    const skillIds = item.skillExternalIds
      ? this.mappingService.resolveFromContext(
          context.idMap,
          'Skill',
          item.skillExternalIds,
        )
      : [];

    // Resolve formatter IDs (optional)
    const formatterIds = item.formatterExternalIds
      ? this.mappingService.resolveFromContext(
          context.idMap,
          'Formatter',
          item.formatterExternalIds,
        )
      : [];

    // Get a system user for createdById (use triggeredBy from options or first admin)
    const createdById = await this.getSystemUserId(tx);

    const created = await tx.assignment.create({
      data: {
        title: item.title,
        description: item.description,
        startDate: new Date(item.startDate),
        endDate: new Date(item.endDate),
        status: item.status ?? AssignmentStatus.SCHEDULED,
        projectTypeId,
        createdById,
        requestId,
        metadata: (item.metadata as object) ?? {},
        members: {
          create: memberIds.map((memberId) => ({ memberId })),
        },
        requiredSkills:
          skillIds.length > 0
            ? {
                create: skillIds.map((skillId) => ({ skillId })),
              }
            : undefined,
        formatters:
          formatterIds.length > 0
            ? {
                create: formatterIds.map((formatterId) => ({ formatterId })),
              }
            : undefined,
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
    item: IngestionAssignment,
    existingId: string,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    // Resolve project type ID
    const projectTypeId = context.idMap.get(
      `ProjectType:${item.projectTypeExternalId}`,
    );
    if (!projectTypeId) {
      throw new Error(
        `Assignment ${item.externalId}: Unknown projectTypeExternalId '${item.projectTypeExternalId}'`,
      );
    }

    // Resolve member IDs
    const memberIds = this.mappingService.resolveFromContext(
      context.idMap,
      'Member',
      item.memberExternalIds,
    );

    // Resolve request ID (optional)
    const requestId = item.requestExternalId
      ? context.idMap.get(`Request:${item.requestExternalId}`)
      : undefined;

    if (context.dryRun) {
      return {
        externalId: item.externalId,
        internalId: existingId,
        status: IngestionRecordStatus.UPDATED,
      };
    }

    // Resolve skill IDs
    const skillIds = item.skillExternalIds
      ? this.mappingService.resolveFromContext(
          context.idMap,
          'Skill',
          item.skillExternalIds,
        )
      : [];

    // Resolve formatter IDs
    const formatterIds = item.formatterExternalIds
      ? this.mappingService.resolveFromContext(
          context.idMap,
          'Formatter',
          item.formatterExternalIds,
        )
      : [];

    // Get existing assignment for metadata merge
    const existing = await tx.assignment.findUnique({
      where: { id: existingId },
    });

    // Update member relations
    await tx.assignmentMember.deleteMany({ where: { assignmentId: existingId } });
    if (memberIds.length > 0) {
      await tx.assignmentMember.createMany({
        data: memberIds.map((memberId) => ({ assignmentId: existingId, memberId })),
      });
    }

    // Update skill relations
    await tx.assignmentSkill.deleteMany({ where: { assignmentId: existingId } });
    if (skillIds.length > 0) {
      await tx.assignmentSkill.createMany({
        data: skillIds.map((skillId) => ({ assignmentId: existingId, skillId })),
      });
    }

    // Update formatter relations
    await tx.assignmentFormatter.deleteMany({ where: { assignmentId: existingId } });
    if (formatterIds.length > 0) {
      await tx.assignmentFormatter.createMany({
        data: formatterIds.map((formatterId) => ({ assignmentId: existingId, formatterId })),
      });
    }

    // Update assignment
    await tx.assignment.update({
      where: { id: existingId },
      data: {
        title: item.title,
        description: item.description,
        startDate: new Date(item.startDate),
        endDate: new Date(item.endDate),
        status: item.status,
        projectTypeId,
        requestId,
        metadata: {
          ...(existing?.metadata as object),
          ...(item.metadata as object),
        },
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

  private async getSystemUserId(tx: PrismaTransaction): Promise<string> {
    // Find first admin user as default creator
    const admin = await tx.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });

    if (!admin) {
      throw new Error('No active admin user found for assignment creation');
    }

    return admin.id;
  }

  async validate(
    data: IngestionAssignment[],
    context: ProcessingContext,
  ): Promise<string[]> {
    const errors = await super.validate(data, context);

    for (const item of data) {
      this.validateItem(item, errors);
    }

    return errors;
  }

  private validateItem(item: IngestionAssignment, errors: string[]): void {
    this.validateRequiredFields(item, errors);
    this.validateDates(item, errors);
  }

  private validateRequiredFields(item: IngestionAssignment, errors: string[]): void {
    if (!item.title || item.title.trim().length === 0) {
      errors.push(`Assignment ${item.externalId}: title is required`);
    }
    if (!item.startDate) {
      errors.push(`Assignment ${item.externalId}: startDate is required`);
    }
    if (!item.endDate) {
      errors.push(`Assignment ${item.externalId}: endDate is required`);
    }
    if (!item.projectTypeExternalId) {
      errors.push(`Assignment ${item.externalId}: projectTypeExternalId is required`);
    }
    if (!item.memberExternalIds || item.memberExternalIds.length === 0) {
      errors.push(`Assignment ${item.externalId}: at least one memberExternalId is required`);
    }
  }

  private validateDates(item: IngestionAssignment, errors: string[]): void {
    if (!item.startDate || !item.endDate) {
      return;
    }

    const start = new Date(item.startDate);
    const end = new Date(item.endDate);

    if (Number.isNaN(start.getTime())) {
      errors.push(`Assignment ${item.externalId}: invalid startDate format`);
    }
    if (Number.isNaN(end.getTime())) {
      errors.push(`Assignment ${item.externalId}: invalid endDate format`);
    }
    if (start > end) {
      errors.push(`Assignment ${item.externalId}: startDate must be before endDate`);
    }
  }
}
