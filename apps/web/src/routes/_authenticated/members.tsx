import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { Role } from '@ghostcast/shared';
import { MembersTable } from '@/components/members/MembersTable';
import { CreateMemberModal } from '@/components/members/CreateMemberModal';
import { Button } from '@/components/ui/button';
import { Users, Plus } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/members')({
  component: MembersPage,
});

function MembersPage() {
  const { hasRole } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canAddMember = hasRole(Role.MANAGER);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        </div>

        {/* Add Member Button - MANAGER and ADMIN only */}
        {canAddMember && (
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Add Member
          </Button>
        )}
      </div>

      {/* Members Table */}
      <MembersTable />

      {/* Create Member Modal */}
      <CreateMemberModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />
    </div>
  );
}
