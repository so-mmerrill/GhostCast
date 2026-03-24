import { createFileRoute } from '@tanstack/react-router';
import { BarChart3 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SkillsDashboardTab } from '@/components/dashboards/SkillsDashboardTab';
import { ProjectRolesDashboardTab } from '@/components/dashboards/ProjectRolesDashboardTab';

export const Route = createFileRoute('/_authenticated/dashboards')({
  component: DashboardsPage,
});

function DashboardsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
          <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboards</h1>
      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue="skills" className="w-full">
        <TabsList>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="project-roles">Project Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="skills">
          <SkillsDashboardTab />
        </TabsContent>
        <TabsContent value="project-roles">
          <ProjectRolesDashboardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
