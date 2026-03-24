import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChangePasswordDialog } from '@/components/user/ChangePasswordDialog';
import { User, Key, Mail } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/profile')({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '??';

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Information Card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Profile Information</h2>

          {/* Avatar Section */}
          <div className="mb-6 flex items-center gap-4">
            <Avatar className="h-20 w-20 ring-2 ring-blue-600">
              <AvatarFallback className="bg-blue-700 text-blue-100 text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Name Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={user?.firstName || ''}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={user?.lastName || ''}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>

          {/* Email Field */}
          <div className="mt-4 space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                readOnly
                className="pl-10 bg-muted"
              />
            </div>
          </div>
        </div>

        {/* Security Card */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Security</h2>

          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Password</p>
                  <p className="text-sm text-muted-foreground">
                    {user?.lastPasswordChange
                      ? `Last changed ${new Date(user.lastPasswordChange).toLocaleDateString()}`
                      : 'Change your password to keep your account secure'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => setIsChangePasswordOpen(true)}
              >
                <Key className="h-4 w-4" />
                Change Password
              </Button>
            </div>

            {/* Account Info */}
            <div className="rounded-lg bg-muted/50 p-4">
              <h3 className="mb-2 font-medium">Account Information</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="font-medium capitalize">{user?.role?.toLowerCase()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">
                    {user?.isActive ? (
                      <span className="text-green-600 dark:text-green-400">Active</span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">Inactive</span>
                    )}
                  </dd>
                </div>
                {user?.lastLogin && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Last Login</dt>
                    <dd className="font-medium">
                      {new Date(user.lastLogin).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={isChangePasswordOpen}
        onOpenChange={setIsChangePasswordOpen}
      />
    </div>
  );
}
