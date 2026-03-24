import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma, PrismaClient } from '@ghostcast/database';

type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class ExternalIdMappingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find an internal ID by source, entity type, and external ID
   */
  async find(
    source: string,
    entityType: string,
    externalId: string,
  ): Promise<string | null> {
    const mapping = await this.prisma.externalIdMapping.findUnique({
      where: {
        source_entityType_externalId: {
          source,
          entityType,
          externalId,
        },
      },
    });
    return mapping?.internalId ?? null;
  }

  /**
   * Find an internal ID using a transaction
   */
  async findWithTx(
    tx: PrismaTransaction,
    source: string,
    entityType: string,
    externalId: string,
  ): Promise<string | null> {
    const mapping = await tx.externalIdMapping.findUnique({
      where: {
        source_entityType_externalId: {
          source,
          entityType,
          externalId,
        },
      },
    });
    return mapping?.internalId ?? null;
  }

  /**
   * Create a new mapping
   */
  async create(
    source: string,
    entityType: string,
    externalId: string,
    internalId: string,
  ): Promise<void> {
    await this.prisma.externalIdMapping.create({
      data: {
        source,
        entityType,
        externalId,
        internalId,
      },
    });
  }

  /**
   * Create a new mapping using a transaction
   */
  async createWithTx(
    tx: PrismaTransaction,
    source: string,
    entityType: string,
    externalId: string,
    internalId: string,
  ): Promise<void> {
    await tx.externalIdMapping.create({
      data: {
        source,
        entityType,
        externalId,
        internalId,
      },
    });
  }

  /**
   * Update an existing mapping
   */
  async update(
    source: string,
    entityType: string,
    externalId: string,
    internalId: string,
  ): Promise<void> {
    await this.prisma.externalIdMapping.update({
      where: {
        source_entityType_externalId: {
          source,
          entityType,
          externalId,
        },
      },
      data: {
        internalId,
      },
    });
  }

  /**
   * Create or update a mapping (upsert)
   */
  async upsert(
    source: string,
    entityType: string,
    externalId: string,
    internalId: string,
  ): Promise<void> {
    await this.prisma.externalIdMapping.upsert({
      where: {
        source_entityType_externalId: {
          source,
          entityType,
          externalId,
        },
      },
      create: {
        source,
        entityType,
        externalId,
        internalId,
      },
      update: {
        internalId,
      },
    });
  }

  /**
   * Upsert using a transaction
   */
  async upsertWithTx(
    tx: PrismaTransaction,
    source: string,
    entityType: string,
    externalId: string,
    internalId: string,
  ): Promise<void> {
    await tx.externalIdMapping.upsert({
      where: {
        source_entityType_externalId: {
          source,
          entityType,
          externalId,
        },
      },
      create: {
        source,
        entityType,
        externalId,
        internalId,
      },
      update: {
        internalId,
      },
    });
  }

  /**
   * Find all mappings for a source
   */
  async findBySource(source: string, entityType?: string) {
    const where: Prisma.ExternalIdMappingWhereInput = { source };
    if (entityType) {
      where.entityType = entityType;
    }

    return this.prisma.externalIdMapping.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete all mappings for a source
   */
  async deleteBySource(source: string): Promise<number> {
    const result = await this.prisma.externalIdMapping.deleteMany({
      where: { source },
    });
    return result.count;
  }

  /**
   * Delete a specific mapping using a transaction
   */
  async deleteWithTx(
    tx: PrismaTransaction,
    source: string,
    entityType: string,
    externalId: string,
  ): Promise<void> {
    await tx.externalIdMapping.deleteMany({
      where: {
        source,
        entityType,
        externalId,
      },
    });
  }

  /**
   * Resolve multiple external IDs to internal IDs
   */
  async resolveMany(
    source: string,
    entityType: string,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    const mappings = await this.prisma.externalIdMapping.findMany({
      where: {
        source,
        entityType,
        externalId: { in: externalIds },
      },
    });

    const result = new Map<string, string>();
    for (const mapping of mappings) {
      result.set(mapping.externalId, mapping.internalId);
    }
    return result;
  }

  /**
   * Resolve external IDs from the in-memory context map or database
   */
  resolveFromContext(
    idMap: Map<string, string>,
    entityType: string,
    externalIds: string[],
  ): string[] {
    const resolved: string[] = [];
    for (const extId of externalIds) {
      const key = `${entityType}:${extId}`;
      const internalId = idMap.get(key);
      if (internalId) {
        resolved.push(internalId);
      }
    }
    return resolved;
  }
}
