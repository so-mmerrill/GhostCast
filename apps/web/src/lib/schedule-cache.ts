import { QueryClient } from '@tanstack/react-query';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { api } from '@/lib/api';

interface Assignment {
  id: string;
  startDate: string;
  endDate: string;
  [key: string]: unknown;
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

function mergeWeekIntoCache(
  existingData: ScheduleData,
  freshAssignments: Assignment[],
  fetchedStart: string,
  fetchedEnd: string
): ScheduleData {
  const filtered = existingData.data.assignments.filter(
    (a) =>
      !rangesOverlap(
        normalizeDate(a.startDate),
        normalizeDate(a.endDate),
        fetchedStart,
        fetchedEnd
      )
  );

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
  dateRanges: Array<{ startDate: string; endDate: string }>
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

  const freshData = await api.get<ScheduleData>('/assignments/calendar', {
    startDate: fetchStart,
    endDate: fetchEnd,
  });

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
      fetchEnd
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
