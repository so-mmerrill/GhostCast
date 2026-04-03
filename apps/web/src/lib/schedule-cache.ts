import { QueryClient } from '@tanstack/react-query';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { api } from '@/lib/api';

interface Assignment {
  id: string;
  startDate: string;
  endDate: string;
  members?: Array<{ member: { id: string } }>;
  [key: string]: unknown;
}

export interface CalendarMember {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
  position: string | null;
  managerId: string | null;
  metadata: Record<string, unknown> | null;
}

interface ScheduleData {
  data: {
    assignments: Assignment[];
    members: unknown[];
    dateRange: {
      startDate: string;
      endDate: string;
    };
  };
}

function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateStr(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function normalizeDate(dateStr: string): string {
  return dateStr.split('T')[0];
}

function getAssignmentMemberIds(assignment: Assignment): string[] {
  return (assignment.members || []).map((m) => m.member.id);
}

function mergeWeekIntoCache(
  existingData: ScheduleData,
  freshAssignments: Assignment[],
  fetchedStart: string,
  fetchedEnd: string,
  memberIds?: string[]
): ScheduleData {
  const memberIdSet = memberIds ? new Set(memberIds) : null;

  const filtered = existingData.data.assignments.filter((a) => {
    const overlaps = rangesOverlap(
      normalizeDate(a.startDate),
      normalizeDate(a.endDate),
      fetchedStart,
      fetchedEnd
    );
    if (!overlaps) return true;
    if (!memberIdSet) return false;
    // Member-scoped: only remove if assignment belongs to one of the specified members
    const aMemberIds = getAssignmentMemberIds(a);
    return !aMemberIds.some((id) => memberIdSet.has(id));
  });

  const quarterStart = normalizeDate(existingData.data.dateRange.startDate);
  const quarterEnd = normalizeDate(existingData.data.dateRange.endDate);
  const relevant = freshAssignments.filter((a) =>
    rangesOverlap(
      normalizeDate(a.startDate),
      normalizeDate(a.endDate),
      quarterStart,
      quarterEnd
    )
  );

  const merged = [...filtered, ...relevant].sort((a, b) =>
    normalizeDate(a.startDate).localeCompare(normalizeDate(b.startDate))
  );

  return {
    ...existingData,
    data: {
      ...existingData.data,
      assignments: merged,
    },
  };
}

/**
 * Refreshes only the affected week(s) in all active schedule caches.
 *
 * @param queryClient  The TanStack QueryClient instance
 * @param dateRanges   One or more { startDate, endDate } ranges to refresh
 *                     (e.g., for an update that moved dates, pass both old and new ranges)
 */
export async function refreshScheduleCache(
  queryClient: QueryClient,
  dateRanges: Array<{ startDate: string; endDate: string }>,
  memberIds?: string[]
): Promise<void> {
  if (dateRanges.length === 0) return;

  const allStarts = dateRanges.map((r) => parseLocalDate(r.startDate));
  const allEnds = dateRanges.map((r) => parseLocalDate(r.endDate));
  const earliest = new Date(Math.min(...allStarts.map((d) => d.getTime())));
  const latest = new Date(Math.max(...allEnds.map((d) => d.getTime())));

  const weekStart = startOfWeek(earliest, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(latest, { weekStartsOn: 1 });
  const fetchStart = toDateStr(weekStart);
  const fetchEnd = toDateStr(weekEnd);

  const params: Record<string, string> = {
    startDate: fetchStart,
    endDate: fetchEnd,
  };
  if (memberIds && memberIds.length > 0) {
    params.memberIds = memberIds.join(',');
  }

  const freshData = await api.get<ScheduleData>('/assignments/calendar', params);

  const freshAssignments = freshData.data.assignments;

  const scheduleEntries = queryClient.getQueriesData<ScheduleData>({
    queryKey: ['schedule'],
  });

  for (const [queryKey, cachedData] of scheduleEntries) {
    if (!cachedData) continue;

    const updatedData = mergeWeekIntoCache(
      cachedData,
      freshAssignments,
      fetchStart,
      fetchEnd,
      memberIds
    );

    queryClient.setQueryData(queryKey, updatedData);
  }
}

/**
 * Directly updates or inserts an assignment in all active schedule caches
 * using the full assignment object (e.g., from a WebSocket payload).
 * No API round-trip needed — the data comes straight from the server post-commit.
 */
export function upsertAssignmentInCache(
  queryClient: QueryClient,
  assignment: Assignment
): void {
  const assignmentStart = normalizeDate(assignment.startDate);
  const assignmentEnd = normalizeDate(assignment.endDate);

  const scheduleEntries = queryClient.getQueriesData<ScheduleData>({
    queryKey: ['schedule'],
  });

  for (const [queryKey, cachedData] of scheduleEntries) {
    if (!cachedData) continue;

    const cacheStart = normalizeDate(cachedData.data.dateRange.startDate);
    const cacheEnd = normalizeDate(cachedData.data.dateRange.endDate);

    // Remove old version of this assignment (if it exists)
    const filtered = cachedData.data.assignments.filter(
      (a) => a.id !== assignment.id
    );

    // Add the updated assignment if it overlaps this cache's date range
    const overlaps = rangesOverlap(assignmentStart, assignmentEnd, cacheStart, cacheEnd);

    const newAssignments = overlaps
      ? [...filtered, assignment].sort((a, b) =>
          normalizeDate(a.startDate).localeCompare(normalizeDate(b.startDate))
        )
      : filtered;

    // Only update cache if something actually changed
    if (newAssignments.length !== cachedData.data.assignments.length ||
        newAssignments.some((a, i) => a !== cachedData.data.assignments[i])) {
      queryClient.setQueryData(queryKey, {
        ...cachedData,
        data: { ...cachedData.data, assignments: newAssignments },
      });
    }
  }
}

/**
 * Removes an assignment by ID from all active schedule caches.
 */
export function removeAssignmentFromCache(
  queryClient: QueryClient,
  assignmentId: string
): void {
  const scheduleEntries = queryClient.getQueriesData<ScheduleData>({
    queryKey: ['schedule'],
  });

  for (const [queryKey, cachedData] of scheduleEntries) {
    if (!cachedData) continue;
    const idx = cachedData.data.assignments.findIndex((a) => a.id === assignmentId);
    if (idx === -1) continue;
    const newAssignments = cachedData.data.assignments.filter((a) => a.id !== assignmentId);
    queryClient.setQueryData(queryKey, {
      ...cachedData,
      data: { ...cachedData.data, assignments: newAssignments },
    });
  }
}

/**
 * Updates request.status on all assignments linked to a given request
 * in all active schedule caches. This ensures assignment bars immediately
 * reflect the new status (color/styling) without waiting for a refetch.
 */
export function updateRequestStatusInCache(
  queryClient: QueryClient,
  requestId: string,
  newStatus: string
): void {
  const scheduleEntries = queryClient.getQueriesData<ScheduleData>({
    queryKey: ['schedule'],
  });

  for (const [queryKey, cachedData] of scheduleEntries) {
    if (!cachedData) continue;

    const req = (a: Assignment) => a.request as { id: string; status: string } | undefined;

    const hasMatch = cachedData.data.assignments.some(
      (a) => req(a)?.id === requestId
    );
    if (!hasMatch) continue;

    queryClient.setQueryData(queryKey, {
      ...cachedData,
      data: {
        ...cachedData.data,
        assignments: cachedData.data.assignments.map((a) => {
          const r = req(a);
          if (r?.id !== requestId) return a;
          return { ...a, request: { ...r, status: newStatus } };
        }),
      },
    });
  }
}

/**
 * Moves a request between paginated status sections by removing it from its
 * old cache and refetching only the target status cache.
 */
export function updateRequestStatusInPaginatedCache(
  queryClient: QueryClient,
  requestId: string,
  newStatus: string
): void {
  // Remove the request from whichever paginated cache currently holds it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient.setQueriesData({ queryKey: ['requests-paginated'] }, (oldData: any) => {
    if (!oldData) return oldData;
    // useInfiniteQuery caches have a pages array
    if (oldData.pages && Array.isArray(oldData.pages)) {
      const hasMatch = oldData.pages.some((page: { data: { id: string }[] }) =>
        page.data.some((r) => r.id === requestId)
      );
      if (!hasMatch) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: { data: { id: string }[]; meta: { total: number } }) => ({
          ...page,
          data: page.data.filter((r) => r.id !== requestId),
          meta: { ...page.meta, total: Math.max(0, page.meta.total - 1) },
        })),
      };
    }
    // useQueries caches have data array directly
    if (oldData.data && Array.isArray(oldData.data)) {
      const hasMatch = oldData.data.some((r: { id: string }) => r.id === requestId);
      if (!hasMatch) return oldData;
      return {
        ...oldData,
        data: oldData.data.filter((r: { id: string }) => r.id !== requestId),
        meta: oldData.meta ? { ...oldData.meta, total: Math.max(0, oldData.meta.total - 1) } : oldData.meta,
      };
    }
    return oldData;
  });

  // Refetch only the target status section so the request appears there
  queryClient.invalidateQueries({ queryKey: ['requests-paginated', newStatus], refetchType: 'all' });
  // For SCHEDULED requests loaded per-month, refetch those too
  if (newStatus === 'SCHEDULED') {
    queryClient.invalidateQueries({ queryKey: ['requests-paginated', 'scheduled-monthly'], refetchType: 'all' });
  }
  // Cancelled requests have their assignments deleted server-side — refresh the schedule
  if (newStatus === 'CANCELLED') {
    queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
  }
}

/**
 * Directly updates or inserts a member in all active schedule caches.
 * Used after member create/edit to avoid refetching the entire schedule.
 */
export function upsertMemberInCache(
  queryClient: QueryClient,
  member: CalendarMember
): void {
  const scheduleEntries = queryClient.getQueriesData<ScheduleData>({
    queryKey: ['schedule'],
  });

  for (const [queryKey, cachedData] of scheduleEntries) {
    if (!cachedData) continue;

    const existingIndex = cachedData.data.members.findIndex(
      (m) => (m as CalendarMember).id === member.id
    );

    let newMembers: unknown[];
    if (existingIndex >= 0) {
      newMembers = [...cachedData.data.members];
      newMembers[existingIndex] = member;
    } else {
      newMembers = [...cachedData.data.members, member];
    }

    queryClient.setQueryData(queryKey, {
      ...cachedData,
      data: { ...cachedData.data, members: newMembers },
    });
  }
}

/**
 * Removes a member by ID from all active schedule caches.
 */
export function removeMemberFromCache(
  queryClient: QueryClient,
  memberId: string
): void {
  const scheduleEntries = queryClient.getQueriesData<ScheduleData>({
    queryKey: ['schedule'],
  });

  for (const [queryKey, cachedData] of scheduleEntries) {
    if (!cachedData) continue;
    const hasMatch = cachedData.data.members.some(
      (m) => (m as CalendarMember).id === memberId
    );
    if (!hasMatch) continue;
    const newMembers = cachedData.data.members.filter(
      (m) => (m as CalendarMember).id !== memberId
    );
    queryClient.setQueryData(queryKey, {
      ...cachedData,
      data: { ...cachedData.data, members: newMembers },
    });
  }
}

/**
 * Searches all active schedule caches for an assignment by ID and returns its dates.
 * Used as a fallback when the WebSocket delete event doesn't include dates.
 */
export function findAssignmentDatesInCache(
  queryClient: QueryClient,
  assignmentId: string
): { startDate: string; endDate: string } | null {
  const scheduleEntries = queryClient.getQueriesData<ScheduleData>({
    queryKey: ['schedule'],
  });

  for (const [, cachedData] of scheduleEntries) {
    if (!cachedData) continue;
    const found = cachedData.data.assignments.find(
      (a) => a.id === assignmentId
    );
    if (found) {
      return { startDate: found.startDate, endDate: found.endDate };
    }
  }

  return null;
}

/**
 * Searches all active schedule caches for an assignment by ID and returns its member IDs.
 * Used to determine affected members before a mutation (e.g., to scope cache refresh).
 */
export function findAssignmentMemberIdsInCache(
  queryClient: QueryClient,
  assignmentId: string
): string[] | null {
  const scheduleEntries = queryClient.getQueriesData<ScheduleData>({
    queryKey: ['schedule'],
  });

  for (const [, cachedData] of scheduleEntries) {
    if (!cachedData) continue;
    const found = cachedData.data.assignments.find(
      (a) => a.id === assignmentId
    );
    if (found?.members) {
      return found.members.map((m) => m.member.id);
    }
  }

  return null;
}
