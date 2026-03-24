import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { Role } from '@ghostcast/shared';
import { AppShell } from '@/components/layout/AppShell';
import { canAccessRoute } from '@/lib/route-permissions';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { PluginUIManager } from '@/features/plugins/PluginUIManager';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    // Check authentication first
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({
        to: '/login',
        search: { redirect: location.pathname },
      });
    }

    // Check if user must reset password before accessing the app
    if (context.auth.user?.mustResetPassword) {
      throw redirect({ to: '/force-reset-password' });
    }

    // Check if user has the UNASSIGNED role (no access to any features)
    if (context.auth.user?.role === Role.UNASSIGNED) {
      throw redirect({ to: '/pending-role' });
    }

    // Check RBAC permissions if user is authenticated
    if (context.auth.user) {
      const hasPermission = canAccessRoute(context.auth.user.role, location.pathname);
      if (!hasPermission) {
        throw redirect({ to: '/unauthorized' });
      }
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // Subscribe to real-time updates for automatic calendar refresh
  useRealtimeSync();

  return (
    <AppShell>
      {/* Plugin UI Manager handles dynamic icon tray registrations */}
      <PluginUIManager />
      <Outlet />
    </AppShell>
  );
}
