import { createFileRoute } from '@tanstack/react-router';
import { FlaskConical } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';

export const Route = createFileRoute('/_authenticated/research-projects')({
  component: ResearchProjectsPage,
});

function ResearchProjectsPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
          <FlaskConical className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Research Projects</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          This page is restricted to users in the <span className="font-semibold text-foreground">Research</span> department.
        </p>
        <p className="mt-2 text-sm">
          Signed in as <span className="font-medium">{user?.firstName} {user?.lastName}</span>
          {user?.department && (
            <> — Department: <span className="font-medium">{user.department}</span></>
          )}
        </p>
      </div>
    </div>
  );
}
