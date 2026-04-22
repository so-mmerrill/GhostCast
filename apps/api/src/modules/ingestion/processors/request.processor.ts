import { Injectable } from '@nestjs/common';
import {
  IngestionRecordResult,
  IngestionRecordStatus,
  IngestionRequest,
  ProcessingContext,
  RequestStatus,
} from '@ghostcast/shared';
import { BaseProcessor } from './base.processor';
import { PrismaTransaction } from './processor.interface';
import { ExternalIdMappingService } from '../services/external-id-mapping.service';

@Injectable()
export class RequestProcessor extends BaseProcessor<IngestionRequest> {
  constructor(mappingService: ExternalIdMappingService) {
    super('Request', mappingService);
  }

  protected async findByNaturalKey(
    _tx: PrismaTransaction,
    _item: IngestionRequest,
  ): Promise<string | null> {
    // Requests don't have a natural key
    return null;
  }

  protected async verifyRecordExists(
    tx: PrismaTransaction,
    existingId: string,
  ): Promise<boolean> {
    const record = await tx.request.findUnique({
      where: { id: existingId },
      select: { id: true },
    });
    return record !== null;
  }

  protected async createRecord(
    tx: PrismaTransaction,
    item: IngestionRequest,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    // Resolve project type ID (optional)
    const projectTypeId = item.projectTypeExternalId
      ? context.idMap.get(`ProjectType:${item.projectTypeExternalId}`)
      : undefined;

    // Resolve member IDs (optional)
    const memberIds = item.memberExternalIds
      ? this.mappingService.resolveFromContext(
          context.idMap,
          'Member',
          item.memberExternalIds,
        )
      : [];

    // Resolve skill IDs (optional)
    const skillIds = item.skillExternalIds
      ? this.mappingService.resolveFromContext(
          context.idMap,
          'Skill',
          item.skillExternalIds,
        )
      : [];

    if (context.dryRun) {
      return {
        externalId: item.externalId,
        status: IngestionRecordStatus.CREATED,
      };
    }

    // Get a system user for requesterId
    const requesterId = await this.getSystemUserId(tx);

    const created = await tx.request.create({
      data: {
        title: item.title,
        description: item.description,
        status: item.status ?? RequestStatus.UNSCHEDULED,
        requesterId,
        requestedStartDate: item.requestedStartDate
          ? new Date(item.requestedStartDate)
          : undefined,
        projectId: item.projectId,
        clientName: item.clientName,
        projectName: item.projectName,
        projectTypeId,
        executionWeeks: item.executionWeeks ?? 0,
        preparationWeeks: item.preparationWeeks ?? 0,
        reportingWeeks: item.reportingWeeks ?? 0,
        travelRequired: item.travelRequired ?? false,
        timezone: item.timezone,
        urlLink: item.urlLink,
        requiredMembers:
          memberIds.length > 0
            ? {
                create: memberIds.map((memberId) => ({ memberId })),
              }
            : undefined,
        requiredSkills:
          skillIds.length > 0
            ? {
                create: skillIds.map((skillId) => ({ skillId })),
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
    item: IngestionRequest,
    existingId: string,
    context: ProcessingContext,
  ): Promise<IngestionRecordResult> {
    // Resolve project type ID (optional)
    const projectTypeId = item.projectTypeExternalId
      ? context.idMap.get(`ProjectType:${item.projectTypeExternalId}`)
      : undefined;

    // Resolve member IDs (optional)
    const memberIds = item.memberExternalIds
      ? this.mappingService.resolveFromContext(
          context.idMap,
          'Member',
          item.memberExternalIds,
        )
      : [];

    // Resolve skill IDs (optional)
    const skillIds = item.skillExternalIds
      ? this.mappingService.resolveFromContext(
          context.idMap,
          'Skill',
          item.skillExternalIds,
        )
      : [];

    if (context.dryRun) {
      return {
        externalId: item.externalId,
        internalId: existingId,
        status: IngestionRecordStatus.UPDATED,
      };
    }

    // Update member relations
    if (item.memberExternalIds !== undefined) {
      await tx.requestMember.deleteMany({ where: { requestId: existingId } });
      if (memberIds.length > 0) {
        await tx.requestMember.createMany({
          data: memberIds.map((memberId) => ({ requestId: existingId, memberId })),
        });
      }
    }

    // Update skill relations
    if (item.skillExternalIds !== undefined) {
      await tx.requestSkill.deleteMany({ where: { requestId: existingId } });
      if (skillIds.length > 0) {
        await tx.requestSkill.createMany({
          data: skillIds.map((skillId) => ({ requestId: existingId, skillId })),
        });
      }
    }

    // Update request
    await tx.request.update({
      where: { id: existingId },
      data: {
        title: item.title,
        description: item.description,
        status: item.status,
        requestedStartDate: item.requestedStartDate
          ? new Date(item.requestedStartDate)
          : undefined,
        projectId: item.projectId,
        clientName: item.clientName,
        projectName: item.projectName,
        projectTypeId,
        executionWeeks: item.executionWeeks,
        preparationWeeks: item.preparationWeeks,
        reportingWeeks: item.reportingWeeks,
        travelRequired: item.travelRequired,
        timezone: item.timezone,
        urlLink: item.urlLink,
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
    // Find first admin user as default requester
    const admin = await tx.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });

    if (!admin) {
      throw new Error('No active admin user found for request creation');
    }

    return admin.id;
  }

  async validate(
    data: IngestionRequest[],
    context: ProcessingContext,
  ): Promise<string[]> {
    const errors = await super.validate(data, context);

    for (const item of data) {
      if (!item.title || item.title.trim().length === 0) {
        errors.push(`Request ${item.externalId}: title is required`);
      }
      if (item.title && item.title.length > 200) {
        errors.push(`Request ${item.externalId}: title must be 200 characters or less`);
      }

      // Validate date format
      if (item.requestedStartDate) {
        const date = new Date(item.requestedStartDate);
        if (Number.isNaN(date.getTime())) {
          errors.push(`Request ${item.externalId}: invalid requestedStartDate format`);
        }
      }
    }

    return errors;
  }
}
