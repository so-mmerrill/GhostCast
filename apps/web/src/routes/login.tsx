import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock } from 'lucide-react';
import logoImg from '@/assets/logo.png';

function handleSsoLogin() {
  const apiBase = import.meta.env.VITE_API_BASE || '/api';
  globalThis.location.href = `${apiBase}/auth/saml/login`;
}

interface LoginSearch {
  redirect: string;
  sso_token?: string;
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: (search.redirect as string) || '/',
    ...(search.sso_token ? { sso_token: search.sso_token as string } : {}),
  }),
});

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [samlEnabled, setSamlEnabled] = useState(false);
  const { login, loginWithToken, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { redirect, sso_token } = useSearch({ from: '/login' });

  // Check if SSO is available
  useEffect(() => {
    api.get<{ data: { samlEnabled: boolean } }>('/auth/sso-config')
      .then((res) => setSamlEnabled(res.data.samlEnabled))
      .catch(() => {});
  }, []);

  // Handle SSO token callback
  useEffect(() => {
    if (sso_token) {
      setIsLoading(true);
      loginWithToken(sso_token)
        .catch(() => {
          toast({
            title: 'SSO Login failed',
            description: 'Could not complete SSO authentication',
            variant: 'destructive',
          });
        })
        .finally(() => setIsLoading(false));

      // Clean the SSO token from the URL
      globalThis.history.replaceState({}, '', `/login?redirect=${encodeURIComponent(redirect)}`);
    }
  }, [sso_token, loginWithToken, redirect, toast]);

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.mustResetPassword) {
        navigate({ to: '/force-reset-password' });
      } else {
        navigate({ to: redirect });
      }
    }
  }, [isAuthenticated, user, navigate, redirect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (error) {
      setIsLoading(false);
      toast({
        title: 'Login failed',
        description: error instanceof Error ? error.message : 'Invalid credentials',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* Login card */}
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-300">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary"
                  required
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
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {samlEnabled && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-800 px-2 text-slate-500">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full border-white/10 bg-white/5 py-5 text-sm font-semibold text-slate-300 hover:bg-white/10"
                disabled={isLoading}
                onClick={handleSsoLogin}
              >
                Sign in with SSO
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
