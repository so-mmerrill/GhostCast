import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { usePasswordPolicy } from '@/hooks/use-password-policy';
import { PasswordRequirements, passwordMeetsPolicy } from '@/components/shared/PasswordRequirements';
import { Loader2, Lock, LogOut } from 'lucide-react';
import logoImg from '@/assets/logo.png';

export const Route = createFileRoute('/force-reset-password')({
  component: ForceResetPasswordPage,
});

function ForceResetPasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, isAuthenticated, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { policy } = usePasswordPolicy();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/' } });
    } else if (user && !user.mustResetPassword) {
      navigate({ to: '/' });
    }
  }, [isAuthenticated, user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!passwordMeetsPolicy(newPassword, policy)) {
      toast({
        title: 'Password requirements not met',
        description: 'Please ensure your password meets all requirements.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please ensure both password fields match.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      await api.put('/auth/password', {
        currentPassword,
        newPassword,
      });

      await refreshUser();

      toast({
        title: 'Password changed',
        description: 'Your password has been updated successfully.',
      });

      navigate({ to: '/' });
    } catch (error) {
      toast({
        title: 'Password change failed',
        description: error instanceof Error ? error.message : 'Failed to change password',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* Reset password card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          {/* Logo */}
          <div className="mb-4 flex justify-center">
            <img
              src={logoImg}
              alt="GhostCast"
              className="h-36 w-auto"
            />
          </div>

          {/* Message */}
          <div className="mb-6 text-center">
            <h2 className="text-lg font-semibold text-white">Password Reset Required</h2>
            <p className="mt-1 text-sm text-slate-400">
              Your administrator requires you to change your password before continuing.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="text-sm font-medium text-slate-300">
                Current Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-sm font-medium text-slate-300">
                New Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary"
                  required
                  minLength={8}
                  maxLength={128}
                />
              </div>
            </div>

            <PasswordRequirements password={newPassword} policy={policy} className="text-slate-400 [&_.text-muted-foreground]:text-slate-500" />

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-300">
                Confirm New Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary"
                  required
                  minLength={8}
                  maxLength={128}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="mt-6 w-full bg-primary py-5 text-sm font-semibold transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing password...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </form>

          {/* Sign out link */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
