import { useState, useMemo } from 'react';
import { Loader2, BookOpen, BarChart3, Users, Tag } from 'lucide-react';
import {
  useDashboardData,
  getFilteredMemberSkills,
  computeSkillStats,
  computeProficiencyDistribution,
  computeCategoryBreakdown,
  computeSkillHeatmapData,
  type SkillsFilters,
} from '@/hooks/use-dashboard-data';
import { DashboardStatsCard } from './DashboardStatsCard';
import { SkillsFilterBar } from './DashboardFilters';
import { ProficiencyDistributionChart } from './charts/ProficiencyDistributionChart';
import { SkillCategoryPieChart } from './charts/SkillCategoryPieChart';
import { SkillHeatmap } from './charts/SkillHeatmap';
import { SkillsDataTable } from './SkillsDataTable';

export function SkillsDashboardTab() {
  const { members, skills, isLoading } = useDashboardData();

  const [filters, setFilters] = useState<SkillsFilters>({
    memberIds: [],
    skillIds: [],
    categories: [],
    levels: [],
  });

  const filteredRows = useMemo(
    () => getFilteredMemberSkills(members, filters),
    [members, filters],
  );

  const stats = useMemo(
    () => computeSkillStats(filteredRows, skills),
    [filteredRows, skills],
  );

  const proficiencyData = useMemo(
    () => computeProficiencyDistribution(filteredRows),
    [filteredRows],
  );

  const categoryData = useMemo(
    () => computeCategoryBreakdown(filteredRows),
    [filteredRows],
  );

  const heatmapData = useMemo(
    () => computeSkillHeatmapData(members, skills, filteredRows),
    [members, skills, filteredRows],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Filters */}
      <SkillsFilterBar
        members={members}
        skills={skills}
        filters={filters}
        onChange={setFilters}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatsCard
          title="Total Skills"
          value={stats.totalSkills}
          icon={BookOpen}
          description={`of ${stats.totalSkillsAvailable} available`}
          iconColorClass="text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30"
        />
        <DashboardStatsCard
          title="Avg Proficiency"
          value={stats.avgProficiency}
          icon={BarChart3}
          description="across all assignments"
          iconColorClass="text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30"
        />
        <DashboardStatsCard
          title="Members with Skills"
          value={stats.membersWithSkills}
          icon={Users}
          description={`of ${members.length} total members`}
          iconColorClass="text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30"
        />
        <DashboardStatsCard
          title="Top Category"
          value={stats.mostCommonCategory}
          icon={Tag}
          iconColorClass="text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProficiencyDistributionChart data={proficiencyData} />
        <SkillCategoryPieChart data={categoryData} />
      </div>

      {/* Heatmap */}
      <SkillHeatmap
        members={heatmapData.members}
        skills={heatmapData.skills}
        lookup={heatmapData.lookup}
      />

      {/* Data Table */}
      <SkillsDataTable data={filteredRows} />
    </div>
  );
}
