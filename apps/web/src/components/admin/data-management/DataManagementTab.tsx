import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { GenericDataTable } from './GenericDataTable';
import { projectTypesConfig, skillsConfig, projectRolesConfig, formattersConfig } from './configs';
import { ProjectType, Skill, ProjectRole, Formatter } from '@ghostcast/shared';

export function DataManagementTab() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <Tabs defaultValue="project-types" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="project-types">Project Types</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="project-roles">Project Roles</TabsTrigger>
          <TabsTrigger value="formatters">Formatters</TabsTrigger>
        </TabsList>

        <TabsContent value="project-types">
          <GenericDataTable<ProjectType> config={projectTypesConfig} />
        </TabsContent>

        <TabsContent value="skills">
          <GenericDataTable<Skill> config={skillsConfig} />
        </TabsContent>

        <TabsContent value="project-roles">
          <GenericDataTable<ProjectRole> config={projectRolesConfig} />
        </TabsContent>

        <TabsContent value="formatters">
          <GenericDataTable<Formatter> config={formattersConfig} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
