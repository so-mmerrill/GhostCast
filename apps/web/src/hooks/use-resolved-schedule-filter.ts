import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Role, ScheduleFilterMode, ScheduleFilterPreference } from '@ghostcast/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';

interface MemberLite {
  id: string;
  department: string | null;
  isActive?: boolean;
}

// Outer shape from the global TransformInterceptor wrapping `{ data: { data, meta } }`.
interface MembersResponse {
  data: { data: MemberLite[] };
}

export interface ResolvedScheduleFilter {
  /** Whether a filter is in effect at all (false → calendar fetches everything as today). */
  filtered: boolean;
  /** When filtered, the deduped list of memberIds the schedule should show. May be empty. */
  memberIds: string[];
  /** True when filtered is true but the union resolved to no member ids (misconfigured). */
  empty: boolean;
  /** The currently active filter mode, for UI messaging. */
  mode: ScheduleFilterMode;
}

/**
 * Resolves the user's persisted scheduleFilter preference into a flat memberIds list
 * to pass to /assignments/calendar.
 *
 * In CUSTOM mode, the visible set is the union of:
 *   - linkedMemberId (auto-linked or admin-set) — always included if present
 *   - members in the selected departments
 *   - explicitly selected memberIds
 *
 * Returns `{ filtered: false }` when no user, role !== MEMBER, or mode === ALL.
 */
export function useResolvedScheduleFilter(): ResolvedScheduleFilter {
  const { user } = useAuth();
  const role = user?.role;

  const filter = useMemo<ScheduleFilterPreference>(() => {
    const prefs = (user?.preferences as Record<string, unknown> | undefined) ?? {};
    const stored = prefs.scheduleFilter as ScheduleFilterPreference | undefined;
    if (stored) return stored;
    // Default for MEMBER users with no saved filter: show only their linked member
    // (or nothing if no link was found). All other roles default to ALL (no filter).
    return role === Role.MEMBER
      ? { mode: ScheduleFilterMode.CUSTOM }
      : { mode: ScheduleFilterMode.ALL };
  }, [user?.preferences, role]);

  // Need the members list when the user has any departments selected (to resolve to ids)
  const needsMembersList =
    role === Role.MEMBER &&
    filter.mode !== ScheduleFilterMode.ALL &&
    !!filter.departments?.length;

  const { data: membersData } = useQuery<MembersResponse>({
    queryKey: ['members', 'all-active', 'for-schedule-filter'],
    queryFn: () => api.get<MembersResponse>('/members', { pageSize: '1000' }),
    staleTime: 5 * 60 * 1000,
    enabled: needsMembersList,
  });

  return useMemo<ResolvedScheduleFilter>(() => {
    if (role !== Role.MEMBER || filter.mode === ScheduleFilterMode.ALL) {
      return { filtered: false, memberIds: [], empty: false, mode: filter.mode };
    }

    // CUSTOM mode (or any non-ALL legacy value): union all three sources.
    const collected = new Set<string>();

    if (filter.linkedMemberId) collected.add(filter.linkedMemberId);

    if (filter.departments?.length) {
      const depts = new Set(filter.departments);
      for (const m of membersData?.data?.data ?? []) {
        if ((m.isActive ?? true) && m.department && depts.has(m.department)) {
          collected.add(m.id);
        }
      }
    }

    if (filter.memberIds?.length) {
      for (const id of filter.memberIds) collected.add(id);
    }

    const memberIds = Array.from(collected).sort((a, b) => a.localeCompare(b));
    return { filtered: true, memberIds, empty: memberIds.length === 0, mode: filter.mode };
  }, [role, filter, membersData]);
}
