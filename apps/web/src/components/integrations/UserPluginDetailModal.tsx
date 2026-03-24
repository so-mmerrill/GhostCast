import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as LucideIcons from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfigurationForm } from './ConfigurationForm';
import { PluginType } from '@ghostcast/shared';
import { UserPluginStatus } from '@/types/user-plugins';
import { Loader2, Power, PowerOff, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface UserPluginDetailModalProps {
  plugin: UserPluginStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserPluginDetailModal({ plugin, open, onOpenChange }: Readonly<UserPluginDetailModalProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [configOpen, setConfigOpen] = useState(true);

  // Fetch user-specific settings for this plugin
  const { data: userSettings = {} } = useQuery({
    queryKey: ['user-settings', plugin?.catalogId],
    queryFn: async () => {
      if (!plugin?.catalogId) return {};
      const response = await api.get<{ data: Record<string, string> }>(
        `/user-settings/${plugin.catalogId}`
      );
      return response.data;
    },
    enabled: !!plugin?.catalogId && open,
    // Always refetch when modal opens to get latest settings
    staleTime: 0,
  });

  // Check if user has configured this plugin
  const { data: configStatus } = useQuery({
    queryKey: ['user-settings', plugin?.catalogId, 'configured'],
    queryFn: async () => {
      if (!plugin?.catalogId) return { configured: false };
      const response = await api.get<{ data: { data: { configured: boolean } } }>(
        `/user-settings/${plugin.catalogId}/configured`
      );
      // API returns {data: {data: {configured: boolean}}} due to response wrapper
      return response.data.data;
    },
    enabled: !!plugin?.catalogId && open,
    staleTime: 0,
  });

  // Update config open state based on whether config exists
  // Collapse the section when plugin is configured
  useEffect(() => {
    if (configStatus?.configured === true) {
      setConfigOpen(false);
    }
  }, [configStatus]);

  const enableMutation = useMutation({
    mutationFn: (catalogId: string) => api.post<{ data: UserPluginStatus }>(`/user-plugins/${catalogId}/enable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-plugins'] });
      toast({ title: 'Plugin enabled for your account' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to enable', description: error.message, variant: 'destructive' });
    },
  });

  const disableMutation = useMutation({
    mutationFn: (catalogId: string) => api.post<{ data: UserPluginStatus }>(`/user-plugins/${catalogId}/disable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-plugins'] });
      toast({ title: 'Plugin disabled for your account' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to disable', description: error.message, variant: 'destructive' });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async ({ catalogId, settings }: { catalogId: string; settings: Record<string, unknown> }) => {
      // Convert all values to strings for the API
      const stringSettings: Record<string, string> = {};
      for (const [key, value] of Object.entries(settings)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }
        // Skip masked sentinel values - these are placeholders from the API
        // that indicate a sensitive value exists but shouldn't be saved as-is
        if (value === '***configured***') {
          continue;
        }
        // Handle arrays (multiselect) and objects by JSON stringify
        if (typeof value === 'object') {
          stringSettings[key] = JSON.stringify(value);
        } else {
          // Primitives: string, number, boolean
          stringSettings[key] = String(value as string | number | boolean);
        }
      }
      return api.put(`/user-settings/${catalogId}`, { settings: stringSettings });
    },
    onSuccess: (_data, variables) => {
      // Only invalidate the 'configured' status query, not the settings query
      // Re-fetching settings would return masked values (***configured***) and reset the form
      queryClient.invalidateQueries({ queryKey: ['user-settings', variables.catalogId, 'configured'] });
      // Invalidate quip-status when AI settings change so AI Import button updates
      if (variables.catalogId === 'openai-llm') {
        queryClient.invalidateQueries({ queryKey: ['quip-status'] });
      }
      toast({ title: 'Configuration saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save configuration', description: error.message, variant: 'destructive' });
    },
  });

  // Merge defaults with user settings - memoize to prevent unnecessary form resets
  // Must be before early return to satisfy React hooks rules
  const configValues = useMemo(() => {
    const values: Record<string, unknown> = {};
    const configSchema = plugin?.catalogItem.configSchema;
    if (configSchema) {
      for (const field of configSchema) {
        if (field.default !== undefined) {
          values[field.key] = field.default;
        }
      }
    }
    // Overlay user settings
    for (const [key, value] of Object.entries(userSettings)) {
      values[key] = value;
    }
    return values;
  }, [plugin?.catalogItem.configSchema, userSettings]);

  if (!plugin) return null;

  const item = plugin.catalogItem;
  const IconComponent =
    (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon] ||
    LucideIcons.Puzzle;

  const isLoading = enableMutation.isPending || disableMutation.isPending;
  const isIntegration = item.type === PluginType.INTEGRATION;
  const hasConfigSchema = item.configSchema && item.configSchema.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-lg',
                isIntegration
                  ? 'bg-blue-100 dark:bg-blue-900/30'
                  : 'bg-purple-100 dark:bg-purple-900/30'
              )}
            >
              <IconComponent
                className={cn(
                  'h-6 w-6',
                  isIntegration
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-purple-600 dark:text-purple-400'
                )}
              />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                {item.displayName}
                <Badge variant="outline">Personal</Badge>
              </DialogTitle>
              <DialogDescription>{item.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Author:</span>{' '}
              <span className="font-medium">{item.author}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Version:</span>{' '}
              <span className="font-medium">{item.version}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Category:</span>{' '}
              <span className="font-medium">{item.category}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{' '}
              <Badge variant={plugin.isEnabled ? 'default' : 'outline'}>
                {plugin.isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className={cn(
                    'text-xs',
                    tag === 'User' && 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
                    tag === 'Admin' && 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  )}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Configuration Form - Collapsible */}
          {hasConfigSchema && (
            <>
              <div className="border-t" />
              {/* Show green banner when configured - outside collapsible so always visible */}
              {configStatus?.configured === true && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span>Configuration saved. Your settings are stored securely.</span>
                </div>
              )}
              <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between px-0 hover:bg-transparent"
                  >
                    <span className="font-medium">Your Configuration</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform',
                        configOpen && 'rotate-180'
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    These settings are stored securely and only apply to your account.
                  </p>
                  <ConfigurationForm
                    schema={item.configSchema!}
                    values={configValues}
                    onSave={(values) =>
                      saveConfigMutation.mutate({ catalogId: plugin.catalogId, settings: values })
                    }
                    disabled={isLoading}
                    isSaving={saveConfigMutation.isPending}
                  />
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {/* Info about personal plugins */}
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            <p>
              This is a personal plugin. Your configuration and enabled status only affects your account
              and is not visible to other users.
            </p>
          </div>
        </div>

        <DialogFooter>
          {plugin.isEnabled ? (
            <Button
              variant="outline"
              onClick={() => disableMutation.mutate(plugin.catalogId)}
              disabled={isLoading}
            >
              {disableMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PowerOff className="h-4 w-4" />
              )}
              Disable
            </Button>
          ) : (
            <Button
              onClick={() => enableMutation.mutate(plugin.catalogId)}
              disabled={isLoading}
            >
              {enableMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              Enable
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
