import { createFileRoute } from '@tanstack/react-router';
import { RequestsPanel } from '@/components/schedule/RequestsPanel';

export const Route = createFileRoute('/_authenticated/requests-panel')({
  component: RequestsPanelPage,
});

function RequestsPanelPage() {
  return (
    <div className="h-screen bg-background">
      <RequestsPanel isStandalone={true} />
    </div>
  );
}
