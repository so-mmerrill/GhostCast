import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Shared service for splitting overlapping assignments across Kantata sync phases.
 *
 * Each sync phase (assignments, FTO, holidays) calls this service with:
 *   - A unique `splitTag` (e.g. "splitFromFto") stored in metadata to identify split segments
 *   - A `memberClaimedRanges` map: memberId → date ranges that the phase is claiming
 *
 * The service then:
 *   1. Cleans up previous splits for that tag (restores members to originals, deletes segments)
 *   2. For each member, finds existing assignments overlapping the claimed ranges
 *   3. Removes the member from the original assignment
 *   4. Creates segment assignments for the non-overlapping date ranges
 */
@Injectable()
export class KantataAssignmentSplitService {
  private readonly logger = new Logger(KantataAssignmentSplitService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Split existing assignments that overlap with claimed date ranges, per member.
   *
   * @param splitTag - Metadata tag identifying this split source (e.g. "splitFromFto")
   * @param memberClaimedRanges - Map of memberId → array of {start, end} date ranges being claimed
   * @returns Count of members removed from originals and segment assignments created
   */
  async splitOverlappingAssignments(
    splitTag: string,
    memberClaimedRanges: Map<string, Array<{ start: string; end: string }>>,
  ): Promise<{ removed: number; created: number }> {
    let totalRemoved = 0;
    let totalCreated = 0;

    await this.cleanupPreviousSplits(splitTag);

    for (const [memberId, ranges] of memberClaimedRanges) {
      if (ranges.length === 0) continue;
      const result = await this.splitForMember(memberId, ranges, splitTag);
      totalRemoved += result.removed;
      totalCreated += result.created;
    }

    return { removed: totalRemoved, created: totalCreated };
  }

  /**
   * Clean up previous split segments for a given tag.
   * Restores members to their original assignments and deletes the split segments.
   */
  async cleanupPreviousSplits(splitTag: string): Promise<void> {
    const previousSplits = await this.prisma.assignment.findMany({
      where: {
        metadata: { path: [splitTag], equals: true },
      },
      select: { id: true, metadata: true },
    });

    if (previousSplits.length === 0) return;

    for (const split of previousSplits) {
      const meta = split.metadata as Record<string, unknown>;
      const originalAssignmentId = meta?.originalAssignmentId as string | undefined;
      if (!originalAssignmentId) continue;

      const splitMembers = await this.prisma.assignmentMember.findMany({
        where: { assignmentId: split.id },
        select: { memberId: true },
      });

      const originalExists = await this.prisma.assignment.findUnique({
        where: { id: originalAssignmentId },
        select: { id: true },
      });

      if (originalExists) {
        for (const { memberId } of splitMembers) {
          const alreadyOn = await this.prisma.assignmentMember.findUnique({
            where: {
              assignmentId_memberId: {
                assignmentId: originalAssignmentId,
                memberId,
              },
            },
          });
          if (!alreadyOn) {
            await this.prisma.assignmentMember.create({
              data: { assignmentId: originalAssignmentId, memberId },
            });
          }
        }
      }
    }

    await this.prisma.assignment.deleteMany({
      where: { id: { in: previousSplits.map((s) => s.id) } },
    });

    this.logger.debug(
      `Cleaned up ${previousSplits.length} previous "${splitTag}" split segments`,
    );
  }

  /**
   * For a single member, find overlapping assignments and split them around the claimed ranges.
   */
  private async splitForMember(
    memberId: string,
    claimedRanges: Array<{ start: string; end: string }>,
    splitTag: string,
  ): Promise<{ removed: number; created: number }> {
    const starts = claimedRanges.map((r) => r.start).sort((a, b) => a.localeCompare(b));
    const ends = claimedRanges.map((r) => r.end).sort((a, b) => b.localeCompare(a));
    const minDate = new Date(starts[0]! + 'T00:00:00Z');
    const maxDate = new Date(ends[0]! + 'T00:00:00Z');

    const overlapping = await this.prisma.assignmentMember.findMany({
      where: {
        memberId,
        assignment: {
          startDate: { lte: maxDate },
          endDate: { gte: minDate },
        },
      },
      include: {
        assignment: {
          select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
            projectTypeId: true,
            status: true,
            requestId: true,
            createdById: true,
            metadata: true,
          },
        },
      },
    });

    let totalRemoved = 0;
    let totalCreated = 0;

    for (const am of overlapping) {
      const assignment = am.assignment;
      const assignmentStart = toDateString(assignment.startDate);
      const assignmentEnd = toDateString(assignment.endDate);

      // Find which claimed ranges actually overlap with this assignment
      const overlappingRanges = claimedRanges.filter(
        (r) => r.start <= assignmentEnd && r.end >= assignmentStart,
      );

      if (overlappingRanges.length === 0) continue;

      // Split the assignment's date range by excluding the claimed ranges
      const segments = splitDateRangeByRanges(
        assignmentStart,
        assignmentEnd,
        overlappingRanges,
      );

      // Remove member from original assignment
      await this.prisma.assignmentMember.delete({ where: { id: am.id } });
      totalRemoved++;

      this.logger.debug(
        `Removed member ${memberId} from assignment "${assignment.title}" (${assignment.id}), creating ${segments.length} segment(s)`,
      );

      // Create segment assignments for remaining date ranges
      for (const segment of segments) {
        await this.prisma.assignment.create({
          data: {
            title: assignment.title,
            description: assignment.description,
            startDate: new Date(segment.start + 'T00:00:00Z'),
            endDate: new Date(segment.end + 'T00:00:00Z'),
            projectTypeId: assignment.projectTypeId,
            status: assignment.status,
            requestId: assignment.requestId,
            createdById: assignment.createdById,
            metadata: {
              [splitTag]: true,
              originalAssignmentId: assignment.id,
            },
            members: { create: { memberId } },
          },
        });
        totalCreated++;
      }
    }

    return { removed: totalRemoved, created: totalCreated };
  }
}

// ── Date utility functions (exported for use by sync services) ──

/**
 * Split a date range into segments by excluding a set of date ranges.
 *
 * Example: range [Jan 1, Jan 20], exclude [{Jan 5, Jan 10}]
 * Result: [{Jan 1, Jan 4}, {Jan 11, Jan 20}]
 */
export function splitDateRangeByRanges(
  start: string,
  end: string,
  excludeRanges: Array<{ start: string; end: string }>,
): Array<{ start: string; end: string }> {
  const sorted = [...excludeRanges].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const segments: Array<{ start: string; end: string }> = [];
  let currentStart = start;

  for (const range of sorted) {
    if (range.start > currentStart && currentStart <= end) {
      const segEnd = dayBefore(range.start);
      if (segEnd >= currentStart) {
        segments.push({ start: currentStart, end: segEnd });
      }
    }
    const nextStart = dayAfter(range.end);
    if (nextStart > currentStart) {
      currentStart = nextStart;
    }
  }

  if (currentStart <= end) {
    segments.push({ start: currentStart, end });
  }

  return segments;
}

/**
 * Split a date range into segments by excluding individual dates.
 *
 * Example: range [2026-01-01, 2026-01-10], exclude [2026-01-05]
 * Result: [{start: 2026-01-01, end: 2026-01-04}, {start: 2026-01-06, end: 2026-01-10}]
 */
export function splitDateRangeByDates(
  start: string,
  end: string,
  excludeDates: string[],
): Array<{ start: string; end: string }> {
  const sorted = [...excludeDates].sort((a, b) => a.localeCompare(b));
  const segments: Array<{ start: string; end: string }> = [];
  let currentStart = start;

  for (const excludeDate of sorted) {
    if (excludeDate > currentStart) {
      segments.push({
        start: currentStart,
        end: dayBefore(excludeDate),
      });
    }
    currentStart = dayAfter(excludeDate);
  }

  if (currentStart <= end) {
    segments.push({ start: currentStart, end });
  }

  return segments;
}

/** Return the day before the given YYYY-MM-DD date string. */
export function dayBefore(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().substring(0, 10);
}

/** Return the day after the given YYYY-MM-DD date string. */
export function dayAfter(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().substring(0, 10);
}

/** Convert a Date to YYYY-MM-DD string. */
export function toDateString(date: Date): string {
  return date.toISOString().substring(0, 10);
}
