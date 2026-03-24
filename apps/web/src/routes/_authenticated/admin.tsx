import { createFileRoute } from '@tanstack/react-router';
import { Shield } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AuditLogTab } from '@/components/admin/AuditLogTab';
import { DataManagementTab } from '@/components/admin/data-management';
import { UserManagementTab } from '@/components/admin/UserManagementTab';
import { ScheduleBackupsTab } from '@/components/admin/ScheduleBackupsTab';
import { SecuritySettingsTab } from '@/components/admin/SecuritySettingsTab';

export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminPage,
});

function AdminPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
          <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Administration</h1>
      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue="data-management" className="w-full">
        <TabsList>
          <TabsTrigger value="data-management">Data Management</TabsTrigger>
          <TabsTrigger value="user-management">User Management</TabsTrigger>
          <TabsTrigger value="schedule-backups">Schedule Backups</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="audit-log">Audit Log</TabsTrigger>
        </TabsList>
        <TabsContent value="data-management">
          <DataManagementTab />
        </TabsContent>
        <TabsContent value="user-management">
          <UserManagementTab />
        </TabsContent>
        <TabsContent value="schedule-backups">
          <ScheduleBackupsTab />
        </TabsContent>
        <TabsContent value="security">
          <SecuritySettingsTab />
        </TabsContent>
        <TabsContent value="audit-log">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
