import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Save, Shield, ShieldCheck } from 'lucide-react';
import { PasswordPolicy } from '@ghostcast/shared';

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSpecial: false,
};

export function SecuritySettingsTab() {
  return (
    <Tabs defaultValue="security" className="w-full">
      <TabsList>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="security">
        <SecuritySubTab />
      </TabsContent>
      <TabsContent value="password">
        <PasswordSubTab />
      </TabsContent>
    </Tabs>
  );
}

function SecuritySubTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Security Settings</h3>
            <p className="text-sm text-muted-foreground">
              Configure general security settings for the application.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">No additional security settings available yet.</p>
      </div>
    </div>
  );
}

function PasswordSubTab() {
  const queryClient = useQueryClient();
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'config', 'password.complexity'],
    queryFn: async () => {
      try {
        const response = await api.get<{ data: { value: PasswordPolicy } }>('/admin/config/password.complexity');
        return response.data.value;
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    if (data) {
      setPolicy({ ...DEFAULT_POLICY, ...data });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put('/admin/config/password.complexity', { value: policy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['password-policy'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'config', 'password.complexity'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Password Complexity Policy</h3>
            <p className="text-sm text-muted-foreground">
              Configure requirements that all new passwords must meet.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minLength">Minimum Length</Label>
              <Input
                id="minLength"
                type="number"
                min={8}
                max={128}
                value={policy.minLength}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    minLength: Math.max(8, Math.min(128, parseInt(e.target.value) || 8)),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxLength">Maximum Length</Label>
              <Input
                id="maxLength"
                type="number"
                min={8}
                max={128}
                value={policy.maxLength}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    maxLength: Math.max(p.minLength, Math.min(128, parseInt(e.target.value) || 128)),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Maximum 128 characters</p>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Character Requirements</Label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="requireUppercase"
                  checked={policy.requireUppercase}
                  onCheckedChange={(checked) =>
                    setPolicy((p) => ({ ...p, requireUppercase: checked === true }))
                  }
                />
                <Label htmlFor="requireUppercase" className="cursor-pointer font-normal">
                  Require at least one uppercase letter (A-Z)
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="requireLowercase"
                  checked={policy.requireLowercase}
                  onCheckedChange={(checked) =>
                    setPolicy((p) => ({ ...p, requireLowercase: checked === true }))
                  }
                />
                <Label htmlFor="requireLowercase" className="cursor-pointer font-normal">
                  Require at least one lowercase letter (a-z)
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="requireNumber"
                  checked={policy.requireNumber}
                  onCheckedChange={(checked) =>
                    setPolicy((p) => ({ ...p, requireNumber: checked === true }))
                  }
                />
                <Label htmlFor="requireNumber" className="cursor-pointer font-normal">
                  Require at least one number (0-9)
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="requireSpecial"
                  checked={policy.requireSpecial}
                  onCheckedChange={(checked) =>
                    setPolicy((p) => ({ ...p, requireSpecial: checked === true }))
                  }
                />
                <Label htmlFor="requireSpecial" className="cursor-pointer font-normal">
                  Require at least one special character (!@#$%^&* etc.)
                </Label>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Policy
              </>
            )}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Policy saved successfully
            </span>
          )}
          {saveMutation.isError && (
            <span className="text-sm text-destructive">
              Failed to save policy
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
