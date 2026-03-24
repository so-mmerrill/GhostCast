import { useState, useMemo } from 'react';
import { Loader2, ShieldCheck, BarChart3, Users, Award } from 'lucide-react';
import {
  useDashboardData,
  getFilteredMemberRoles,
  computeRoleStats,
  computeRoleDistribution,
  computeRoleCoverageData,
  type RolesFilters,
} from '@/hooks/use-dashboard-data';
import { DashboardStatsCard } from './DashboardStatsCard';
import { RolesFilterBar } from './DashboardFilters';
import { RoleDistributionChart } from './charts/RoleDistributionChart';
import { RoleCoverageHeatmap } from './charts/RoleCoverageHeatmap';
import { RolesDataTable } from './RolesDataTable';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';

export function ProjectRolesDashboardTab() {
  const { members, projectRoles, isLoading } = useDashboardData();

  const [filters, setFilters] = useState<RolesFilters>({
    memberIds: [],
    roleIds: [],
  });

  const filteredRows = useMemo(
    () => getFilteredMemberRoles(members, filters),
    [members, filters],
  );

  const stats = useMemo(
    () => computeRoleStats(filteredRows, projectRoles, members),
    [filteredRows, projectRoles, members],
  );

  const distributionData = useMemo(
    () => computeRoleDistribution(filteredRows, projectRoles),
    [filteredRows, projectRoles],
  );

  const coverageData = useMemo(
    () => computeRoleCoverageData(members, projectRoles, filteredRows),
    [members, projectRoles, filteredRows],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pieData = distributionData.filter(d => d.count > 0);

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Filters */}
      <RolesFilterBar
        members={members}
        roles={projectRoles}
        filters={filters}
        onChange={setFilters}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatsCard
          title="Active Roles"
          value={stats.totalRoles}
          icon={ShieldCheck}
          description={`of ${stats.totalRolesAvailable} available`}
          iconColorClass="text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30"
        />
        <DashboardStatsCard
          title="Avg Roles/Member"
          value={stats.avgRolesPerMember}
          icon={BarChart3}
          description="across assigned members"
          iconColorClass="text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30"
        />
        <DashboardStatsCard
          title="Members with Roles"
          value={stats.membersWithRoles}
          icon={Users}
          description={`of ${stats.totalMembers} total members`}
          iconColorClass="text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30"
        />
        <DashboardStatsCard
          title="Top Role"
          value={stats.mostAssignedRole}
          icon={Award}
          iconColorClass="text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RoleDistributionChart data={distributionData} />
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Role Distribution</h3>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                No role data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="name"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                    formatter={(value) => <span className="text-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coverage Heatmap */}
      <RoleCoverageHeatmap
        members={coverageData.members}
        roles={coverageData.roles}
        lookup={coverageData.lookup}
      />

      {/* Data Table */}
      <RolesDataTable data={filteredRows} />
    </div>
  );
}
