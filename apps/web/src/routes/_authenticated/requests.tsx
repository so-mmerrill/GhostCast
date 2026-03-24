import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { RequestsTable } from '@/components/requests/RequestsTable';
import { CreateRequestModal } from '@/components/requests/CreateRequestModal';
import { Button } from '@/components/ui/button';
import { ClipboardList, Plus } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/requests')({
  component: RequestsPage,
});

function RequestsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Requests Table */}
      <RequestsTable onNewRequest={() => setIsCreateModalOpen(true)} />

      {/* Create Request Modal */}
      <CreateRequestModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
    </div>
  );
}
