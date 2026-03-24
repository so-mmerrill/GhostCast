import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserX } from 'lucide-react';

export const Route = createFileRoute('/pending-role')({
  component: PendingRolePage,
});

function PendingRolePage() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      globalThis.location.href = '/login';
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UserX className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">No Role Assigned</CardTitle>
          <CardDescription>
            Contact your administrator to have a role assigned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <p className="text-center text-sm text-muted-foreground">
              Signed in as <span className="font-medium">{user.email}</span>
            </p>
          )}
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleLogout}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
