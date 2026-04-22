import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Member, Skill, ProjectRole, MemberSkill, MemberProjectRole } from '@/types/member';

// --- Proficiency level constants ---

export const SKILL_LEVELS = [
  { value: 1, label: 'No skill', color: '#9CA3AF', bgClass: 'bg-gray-100 dark:bg-gray-800' },
  { value: 2, label: 'Foundational', color: '#3B82F6', bgClass: 'bg-blue-100 dark:bg-blue-900/30' },
  { value: 3, label: 'Working', color: '#EAB308', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { value: 4, label: 'Proficient', color: '#F97316', bgClass: 'bg-orange-100 dark:bg-orange-900/30' },
  { value: 5, label: 'Mastery', color: '#22C55E', bgClass: 'bg-green-100 dark:bg-green-900/30' },
] as const;

// --- Filter types ---

export interface SkillsFilters {
  memberIds: string[];
  skillIds: string[];
  categories: string[];
  levels: number[];
}

export interface RolesFilters {
  memberIds: string[];
  roleIds: string[];
}

// --- Response helpers ---

function extractArray<T>(response: unknown): T[] {
  if (!response) return [];
  const res = response as Record<string, unknown>;
  if (Array.isArray(res.data)) return res.data as T[];
  if (res.data && typeof res.data === 'object' && 'data' in (res.data as Record<string, unknown>)) {
    const nested = (res.data as Record<string, unknown>).data;
    if (Array.isArray(nested)) return nested as T[];
  }
  if (Array.isArray(response)) return response as T[];
  return [];
}

// --- Hook ---

export function useDashboardData() {
  const membersQuery = useQuery({
    queryKey: ['dashboard', 'members'],
    queryFn: () => api.get<unknown>('/members', { pageSize: '1000' }),
    staleTime: 5 * 60 * 1000,
  });

  const skillsQuery = useQuery({
    queryKey: ['dashboard', 'skills'],
    queryFn: () => api.get<unknown>('/skills', { pageSize: '1000' }),
    staleTime: 5 * 60 * 1000,
  });

  const rolesQuery = useQuery({
    queryKey: ['dashboard', 'project-roles'],
    queryFn: () => api.get<unknown>('/project-roles', { pageSize: '1000' }),
    staleTime: 5 * 60 * 1000,
  });

  const members = useMemo(() => extractArray<Member>(membersQuery.data).filter(m => m.isActive), [membersQuery.data]);
  const skills = useMemo(() => extractArray<Skill>(skillsQuery.data).filter(s => s.isActive), [skillsQuery.data]);
  const projectRoles = useMemo(() => extractArray<ProjectRole>(rolesQuery.data), [rolesQuery.data]);

  const isLoading = membersQuery.isLoading || skillsQuery.isLoading || rolesQuery.isLoading;

  return { members, skills, projectRoles, isLoading };
}

// --- Aggregation helpers ---

export function getFilteredMemberSkills(
  members: Member[],
  filters: SkillsFilters,
): { member: Member; memberSkill: MemberSkill }[] {
  const rows: { member: Member; memberSkill: MemberSkill }[] = [];

  for (const member of members) {
    if (filters.memberIds.length > 0 && !filters.memberIds.includes(member.id)) continue;
    for (const ms of member.skills || []) {
      if (filters.skillIds.length > 0 && !filters.skillIds.includes(ms.skillId)) continue;
      if (filters.categories.length > 0 && !filters.categories.includes(ms.skill?.category || 'Uncategorized')) continue;
      if (filters.levels.length > 0 && !filters.levels.includes(ms.level)) continue;
      rows.push({ member, memberSkill: ms });
    }
  }

  return rows;
}

export function getFilteredMemberRoles(
  members: Member[],
  filters: RolesFilters,
): { member: Member; memberRole: MemberProjectRole }[] {
  const rows: { member: Member; memberRole: MemberProjectRole }[] = [];

  for (const member of members) {
    if (filters.memberIds.length > 0 && !filters.memberIds.includes(member.id)) continue;
    for (const mr of member.projectRoles || []) {
      if (filters.roleIds.length > 0 && !filters.roleIds.includes(mr.projectRoleId)) continue;
      rows.push({ member, memberRole: mr });
    }
  }

  return rows;
}

export function computeSkillStats(
  filteredRows: { member: Member; memberSkill: MemberSkill }[],
  allSkills: Skill[],
) {
  const uniqueSkillIds = new Set(filteredRows.map(r => r.memberSkill.skillId));
  const uniqueMemberIds = new Set(filteredRows.map(r => r.member.id));

  const totalAssignments = filteredRows.length;
  const avgProficiency = totalAssignments > 0
    ? filteredRows.reduce((sum, r) => sum + r.memberSkill.level, 0) / totalAssignments
    : 0;

  // Most common category
  const categoryCounts: Record<string, number> = {};
  for (const row of filteredRows) {
    const cat = row.memberSkill.skill?.category || 'Uncategorized';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }
  const mostCommonCategory = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  return {
    totalSkills: uniqueSkillIds.size,
    totalSkillsAvailable: allSkills.length,
    membersWithSkills: uniqueMemberIds.size,
    avgProficiency: Math.round(avgProficiency * 10) / 10,
    mostCommonCategory,
  };
}

export function computeProficiencyDistribution(
  filteredRows: { memberSkill: MemberSkill }[],
) {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of filteredRows) {
    const level = row.memberSkill.level;
    if (level >= 1 && level <= 5) {
      counts[level]++;
    }
  }
  return SKILL_LEVELS.map(sl => ({
    level: sl.value,
    label: `${sl.value} - ${sl.label}`,
    count: counts[sl.value] || 0,
    color: sl.color,
  }));
}

export function computeCategoryBreakdown(
  filteredRows: { memberSkill: MemberSkill }[],
) {
  const counts: Record<string, number> = {};
  for (const row of filteredRows) {
    const cat = row.memberSkill.skill?.category || 'Uncategorized';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#64748B'];
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name,
      value,
      color: COLORS[i % COLORS.length],
    }));
}

export function computeSkillHeatmapData(
  members: Member[],
  skills: Skill[],
  filteredRows: { member: Member; memberSkill: MemberSkill }[],
) {
  // Build a lookup: memberId -> skillId -> level
  const lookup = new Map<string, Map<string, number>>();
  for (const row of filteredRows) {
    if (!lookup.has(row.member.id)) lookup.set(row.member.id, new Map());
    lookup.get(row.member.id)!.set(row.memberSkill.skillId, row.memberSkill.level);
  }

  // Only include members and skills that appear in filtered data
  const activeMembers = members.filter(m => lookup.has(m.id));
  const activeSkillIds = new Set(filteredRows.map(r => r.memberSkill.skillId));
  const activeSkills = skills.filter(s => activeSkillIds.has(s.id));

  return {
    members: activeMembers.map(m => ({ id: m.id, name: `${m.firstName} ${m.lastName}` })),
    skills: activeSkills.map(s => ({ id: s.id, name: s.name, category: s.category })),
    lookup,
  };
}

export function computeRoleStats(
  filteredRows: { member: Member; memberRole: MemberProjectRole }[],
  allRoles: ProjectRole[],
  allMembers: Member[],
) {
  const uniqueRoleIds = new Set(filteredRows.map(r => r.memberRole.projectRoleId));
  const uniqueMemberIds = new Set(filteredRows.map(r => r.member.id));

  const avgRolesPerMember = uniqueMemberIds.size > 0
    ? filteredRows.length / uniqueMemberIds.size
    : 0;

  // Most assigned role
  const roleCounts: Record<string, number> = {};
  for (const row of filteredRows) {
    const name = row.memberRole.projectRole?.name || 'Unknown';
    roleCounts[name] = (roleCounts[name] || 0) + 1;
  }
  const mostAssignedRole = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  return {
    totalRoles: uniqueRoleIds.size,
    totalRolesAvailable: allRoles.length,
    membersWithRoles: uniqueMemberIds.size,
    totalMembers: allMembers.length,
    avgRolesPerMember: Math.round(avgRolesPerMember * 10) / 10,
    mostAssignedRole,
  };
}

export function computeRoleDistribution(
  filteredRows: { memberRole: MemberProjectRole }[],
  allRoles: ProjectRole[],
) {
  const counts: Record<string, { count: number; color: string }> = {};
  for (const role of allRoles) {
    counts[role.name] = { count: 0, color: role.color || '#6B7280' };
  }
  for (const row of filteredRows) {
    const name = row.memberRole.projectRole?.name || 'Unknown';
    if (!counts[name]) counts[name] = { count: 0, color: row.memberRole.projectRole?.color || '#6B7280' };
    counts[name].count++;
  }
  return Object.entries(counts)
    .map(([name, { count, color }]) => ({ name, count, color }))
    .sort((a, b) => b.count - a.count);
}

export function computeRoleCoverageData(
  members: Member[],
  roles: ProjectRole[],
  filteredRows: { member: Member; memberRole: MemberProjectRole }[],
) {
  // Build lookup: memberId -> Set of roleIds
  const lookup = new Map<string, Set<string>>();
  for (const row of filteredRows) {
    if (!lookup.has(row.member.id)) lookup.set(row.member.id, new Set());
    lookup.get(row.member.id)!.add(row.memberRole.projectRoleId);
  }

  const activeMembers = members.filter(m => lookup.has(m.id));

  return {
    members: activeMembers.map(m => ({ id: m.id, name: `${m.firstName} ${m.lastName}` })),
    roles: roles.map(r => ({ id: r.id, name: r.name, color: r.color || '#6B7280' })),
    lookup,
  };
}
