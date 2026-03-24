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
import { PdfResumeImportModal } from './PdfResumeImportModal';
import { CatalogWithInstallStatus, PluginType, PluginScope, InstalledPlugin } from '@ghostcast/shared';
import { Loader2, Power, PowerOff, Trash2, Download, RefreshCw, ChevronDown, User } from 'lucide-react';
import { UserPluginStatus } from '@/types/user-plugins';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface IntegrationDetailModalProps {
  item: CatalogWithInstallStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ToggleButtonProps {
  readonly isEnabled: boolean;
  readonly isLoading: boolean;
  readonly isPending: boolean;
  readonly onEnable: () => void;
  readonly onDisable: () => void;
  readonly enableLabel: string;
  readonly disableLabel: string;
}

function ToggleButton({
  isEnabled,
  isLoading,
  isPending,
  onEnable,
  onDisable,
  enableLabel,
  disableLabel,
}: Readonly<ToggleButtonProps>) {
  if (isEnabled) {
    return (
      <Button variant="outline" onClick={onDisable} disabled={isLoading}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
        {disableLabel}
      </Button>
    );
  }

  return (
    <Button onClick={onEnable} disabled={isLoading}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
      {enableLabel}
    </Button>
  );
}

interface StatusBadgeProps {
  readonly isUserScoped: boolean;
  readonly isUserEnabled?: boolean;
  readonly isSystemEnabled?: boolean;
}

function StatusBadge({ isUserScoped, isUserEnabled, isSystemEnabled }: Readonly<StatusBadgeProps>) {
  if (isUserScoped) {
    return (
      <Badge variant={isUserEnabled ? 'default' : 'outline'}>
        <User className="mr-1 h-3 w-3" />
        {isUserEnabled ? 'Enabled for you' : 'Not enabled for you'}
      </Badge>
    );
  }
  return (
    <Badge variant={isSystemEnabled ? 'default' : 'outline'}>
      {isSystemEnabled ? 'Enabled' : 'Disabled'}
    </Badge>
  );
}

interface ActionButtonProps {
  readonly action: {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    dangerous?: boolean;
  };
  readonly isLoading: boolean;
  readonly isExecuting: boolean;
  readonly onExecute: () => void;
  readonly onPdfImport?: () => void;
}

function ActionButton({ action, isLoading, isExecuting, onExecute, onPdfImport }: Readonly<ActionButtonProps>) {
  const ActionIcon = action.icon
    ? (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[action.icon] || RefreshCw
    : RefreshCw;

  if (action.id === 'import-resume' && onPdfImport) {
    return (
      <Button
        variant="outline"
        onClick={onPdfImport}
        disabled={isLoading}
        title={action.description}
      >
        <ActionIcon className="h-4 w-4" />
        {action.label}
      </Button>
    );
  }

  return (
    <Button
      variant={action.dangerous ? 'destructive' : 'outline'}
      onClick={onExecute}
      disabled={isLoading}
      title={action.description}
    >
      {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ActionIcon className="h-4 w-4" />}
      {action.label}
    </Button>
  );
}

interface ConfigSectionProps {
  readonly title: string;
  readonly description?: string;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: React.ReactNode;
}

function ConfigSection({ title, description, isOpen, onOpenChange, children }: Readonly<ConfigSectionProps>) {
  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between px-0 hover:bg-transparent"
        >
          <span className="font-medium">{title}</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-2">
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function TagBadge({ tag }: Readonly<{ tag: string }>) {
  const tagClassName = cn(
    'text-xs',
    tag === 'User' && 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    tag === 'Admin' && 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  );
  return <Badge variant="outline" className={tagClassName}>{tag}</Badge>;
}

function UserScopedInfo() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4" />
        <span className="font-medium">Per-user plugin</span>
      </div>
      <p className="mt-1 text-xs opacity-80">
        This plugin is enabled individually by each user. Installing makes it available to all users,
        but each user must enable it for themselves to see the chat window.
      </p>
    </div>
  );
}

interface UninstallButtonProps {
  readonly isPending: boolean;
  readonly isLoading: boolean;
  readonly onUninstall: () => void;
}

function UninstallButton({ isPending, isLoading, onUninstall }: Readonly<UninstallButtonProps>) {
  return (
    <Button variant="destructive" onClick={onUninstall} disabled={isLoading}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Uninstall
    </Button>
  );
}

interface InstallButtonProps {
  readonly isPending: boolean;
  readonly isLoading: boolean;
  readonly onInstall: () => void;
}

function InstallButton({ isPending, isLoading, onInstall }: Readonly<InstallButtonProps>) {
  return (
    <Button onClick={onInstall} disabled={isLoading} className="w-full sm:w-auto">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Install
    </Button>
  );
}

function ConfiguredBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
      <span className="text-green-600 dark:text-green-400">✓</span>
      <span>Configuration saved. Your settings are stored securely.</span>
    </div>
  );
}

interface ModalFooterProps {
  readonly isInstalled: boolean;
  readonly isLoading: boolean;
  readonly uninstallIsPending: boolean;
  readonly installIsPending: boolean;
  readonly onUninstall: () => void;
  readonly onInstall: () => void;
  readonly toggleProps: Omit<ToggleButtonProps, 'isLoading'>;
}

function ModalFooter({
  isInstalled,
  isLoading,
  uninstallIsPending,
  installIsPending,
  onUninstall,
  onInstall,
  toggleProps,
}: Readonly<ModalFooterProps>) {
  if (isInstalled) {
    return (
      <>
        <UninstallButton isPending={uninstallIsPending} isLoading={isLoading} onUninstall={onUninstall} />
        <div className="flex-1" />
        <ToggleButton {...toggleProps} isLoading={isLoading} />
      </>
    );
  }
  return <InstallButton isPending={installIsPending} isLoading={isLoading} onInstall={onInstall} />;
}

function getInitialConfig(item: CatalogWithInstallStatus | null): { config: Record<string, unknown>; isOpen: boolean } {
  if (item?.installed?.config) {
    return { config: item.installed.config, isOpen: false };
  }
  if (item?.configSchema) {
    const defaults: Record<string, unknown> = {};
    for (const field of item.configSchema) {
      if (field.default !== undefined) {
        defaults[field.key] = field.default;
      }
    }
    return { config: defaults, isOpen: true };
  }
  return { config: {}, isOpen: true };
}

function convertSettingsToStrings(settings: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === null || value === '') continue;
    if (value === '***configured***') continue;
    if (typeof value === 'object') {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = String(value as string | number | boolean);
    }
  }
  return result;
}

function mergeUserConfigValues(
  item: CatalogWithInstallStatus | null,
  userSettings: Record<string, string>
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (item?.configSchema) {
    for (const field of item.configSchema) {
      if (field.default !== undefined) {
        values[field.key] = field.default;
      }
    }
  }
  for (const [key, value] of Object.entries(userSettings)) {
    values[key] = value;
  }
  return values;
}

interface GetTogglePropsParams {
  isUserScoped: boolean;
  userPluginStatus?: { isEnabled: boolean };
  userEnableMutation: { mutate: (id: string) => void; isPending: boolean };
  userDisableMutation: { mutate: (id: string) => void; isPending: boolean };
  enableMutation: { mutate: (id: string) => void; isPending: boolean };
  disableMutation: { mutate: (id: string) => void; isPending: boolean };
  itemId: string;
  installedId?: string;
  installedIsEnabled?: boolean;
}

function getToggleProps(params: GetTogglePropsParams): Omit<ToggleButtonProps, 'isLoading'> {
  if (params.isUserScoped) {
    return {
      isEnabled: !!params.userPluginStatus?.isEnabled,
      isPending: params.userDisableMutation.isPending || params.userEnableMutation.isPending,
      onEnable: () => params.userEnableMutation.mutate(params.itemId),
      onDisable: () => params.userDisableMutation.mutate(params.itemId),
      enableLabel: 'Enable for me',
      disableLabel: 'Disable for me',
    };
  }
  return {
    isEnabled: !!params.installedIsEnabled,
    isPending: params.disableMutation.isPending || params.enableMutation.isPending,
    onEnable: () => params.enableMutation.mutate(params.installedId!),
    onDisable: () => params.disableMutation.mutate(params.installedId!),
    enableLabel: 'Enable',
    disableLabel: 'Disable',
  };
}

function checkPluginEnabled(
  isUserScoped: boolean,
  userPluginStatus: { isEnabled: boolean } | undefined,
  installedIsEnabled: boolean | undefined
): boolean {
  if (isUserScoped) {
    return !!userPluginStatus?.isEnabled;
  }
  return !!installedIsEnabled;
}

export function IntegrationDetailModal({ item, open, onOpenChange }: Readonly<IntegrationDetailModalProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [configOpen, setConfigOpen] = useState<boolean>(true);

  // Reset config when item changes
  useEffect(() => {
    const initial = getInitialConfig(item);
    setConfig(initial.config);
    setConfigOpen(initial.isOpen);
  }, [item]);

  const installMutation = useMutation({
    mutationFn: (catalogId: string) =>
      api.post<InstalledPlugin>(`/integrations/${catalogId}/install`, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast({ title: 'Integration installed successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to install', description: error.message, variant: 'destructive' });
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => api.post<InstalledPlugin>(`/integrations/${id}/enable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast({ title: 'Integration enabled' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to enable', description: error.message, variant: 'destructive' });
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => api.post<InstalledPlugin>(`/integrations/${id}/disable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast({ title: 'Integration disabled' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to disable', description: error.message, variant: 'destructive' });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast({ title: 'Integration uninstalled' });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to uninstall', description: error.message, variant: 'destructive' });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ id, config }: { id: string; config: Record<string, unknown> }) =>
      api.put<InstalledPlugin>(`/integrations/${id}/config`, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast({ title: 'Configuration saved' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to save configuration',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [pdfResumeImportOpen, setPdfResumeImportOpen] = useState(false);

  const executeActionMutation = useMutation({
    mutationFn: ({ id, actionId }: { id: string; actionId: string }) =>
      api.post(`/integrations/${id}/actions/${actionId}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      const action = item?.actions?.find((a) => a.id === variables.actionId);
      toast({ title: `${action?.label || 'Action'} completed successfully` });
      setExecutingAction(null);
    },
    onError: (error: Error, variables) => {
      const action = item?.actions?.find((a) => a.id === variables.actionId);
      toast({
        title: `${action?.label || 'Action'} failed`,
        description: error.message,
        variant: 'destructive',
      });
      setExecutingAction(null);
    },
  });

  // For USER-scoped plugins: fetch the current user's enable status
  const isUserScoped = item?.scope === PluginScope.USER;
  const { data: userPluginStatus } = useQuery({
    queryKey: ['user-plugins', item?.id],
    queryFn: async () => {
      const response = await api.get<{ data: UserPluginStatus[] }>('/user-plugins');
      return response.data.find((p) => p.catalogId === item?.id);
    },
    enabled: open && isUserScoped && !!item?.isInstalled,
  });

  // User plugin enable mutation (for USER-scoped plugins)
  const userEnableMutation = useMutation({
    mutationFn: (catalogId: string) =>
      api.post<UserPluginStatus>(`/user-plugins/${catalogId}/enable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['user-plugins'] });
      toast({ title: 'Plugin enabled for your account' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to enable', description: error.message, variant: 'destructive' });
    },
  });

  // User plugin disable mutation (for USER-scoped plugins)
  const userDisableMutation = useMutation({
    mutationFn: (catalogId: string) =>
      api.post<UserPluginStatus>(`/user-plugins/${catalogId}/disable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['user-plugins'] });
      toast({ title: 'Plugin disabled for your account' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to disable', description: error.message, variant: 'destructive' });
    },
  });

  // For USER-scoped plugins: fetch user-specific settings
  const { data: userSettings = {} } = useQuery({
    queryKey: ['user-settings', item?.id],
    queryFn: async () => {
      if (!item?.id) return {};
      const response = await api.get<{ data: Record<string, string> }>(
        `/user-settings/${item.id}`
      );
      return response.data;
    },
    enabled: open && isUserScoped && !!item?.isInstalled,
    staleTime: 0,
  });

  // Check if user has configured this plugin
  const { data: userConfigStatus } = useQuery({
    queryKey: ['user-settings', item?.id, 'configured'],
    queryFn: async () => {
      if (!item?.id) return { configured: false };
      const response = await api.get<{ data: { data: { configured: boolean } } }>(
        `/user-settings/${item.id}/configured`
      );
      return response.data.data;
    },
    enabled: open && isUserScoped && !!item?.isInstalled,
    staleTime: 0,
  });

  // Save user-specific configuration mutation
  const saveUserConfigMutation = useMutation({
    mutationFn: async ({ catalogId, settings }: { catalogId: string; settings: Record<string, unknown> }) => {
      const stringSettings = convertSettingsToStrings(settings);
      return api.put(`/user-settings/${catalogId}`, { settings: stringSettings });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-settings', variables.catalogId, 'configured'] });
      if (variables.catalogId === 'openai-llm') {
        queryClient.invalidateQueries({ queryKey: ['quip-status'] });
      }
      toast({ title: 'Your configuration saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save configuration', description: error.message, variant: 'destructive' });
    },
  });

  // Merge defaults with user settings for USER-scoped plugins
  const userConfigValues = useMemo(() => {
    if (!isUserScoped) return {};
    return mergeUserConfigValues(item, userSettings);
  }, [isUserScoped, item, userSettings]);

  // State for user config section
  const [userConfigOpen, setUserConfigOpen] = useState(true);

  // Collapse user config when already configured
  useEffect(() => {
    if (userConfigStatus?.configured === true) {
      setUserConfigOpen(false);
    }
  }, [userConfigStatus]);

  if (!item) return null;

  const IconComponent =
    (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon] ||
    LucideIcons.Puzzle;

  const isLoading =
    installMutation.isPending ||
    enableMutation.isPending ||
    disableMutation.isPending ||
    uninstallMutation.isPending ||
    executeActionMutation.isPending ||
    userEnableMutation.isPending ||
    userDisableMutation.isPending ||
    saveUserConfigMutation.isPending;

  const isIntegration = item.type === PluginType.INTEGRATION;

  const iconContainerClass = cn(
    'flex h-12 w-12 items-center justify-center rounded-lg',
    isIntegration ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'
  );
  const iconClass = cn(
    'h-6 w-6',
    isIntegration ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'
  );
  const badgeVariant = isIntegration ? 'default' : 'secondary';
  const badgeLabel = isIntegration ? 'Integration' : 'Extension';

  const toggleProps = getToggleProps({
    isUserScoped,
    userPluginStatus,
    userEnableMutation,
    userDisableMutation,
    enableMutation,
    disableMutation,
    itemId: item.id,
    installedId: item.installed?.id,
    installedIsEnabled: item.installed?.isEnabled,
  });

  const isPluginEnabled = checkPluginEnabled(isUserScoped, userPluginStatus, item.installed?.isEnabled);
  const showActions = item.isInstalled && isPluginEnabled && item.actions && item.actions.length > 0;
  const hasTags = item.tags && item.tags.length > 0;
  const hasSystemConfig = item.configSchema && item.configSchema.length > 0 && !isUserScoped;
  const hasUserConfig = isUserScoped && item.isInstalled && item.configSchema && item.configSchema.length > 0;
  const showUserScopedInfo = isUserScoped && item.isInstalled;
  const showConfiguredBanner = userConfigStatus?.configured === true;
  const showStatusBadge = item.isInstalled;
  const configValues = item.installed?.config || config;
  const configOnChange = item.isInstalled ? undefined : setConfig;
  const configOnSave = item.isInstalled
    ? (values: Record<string, unknown>) => updateConfigMutation.mutate({ id: item.installed!.id, config: values })
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className={iconContainerClass}>
              <IconComponent className={iconClass} />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                {item.displayName}
                <Badge variant={badgeVariant}>{badgeLabel}</Badge>
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
            {showStatusBadge && (
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <StatusBadge
                  isUserScoped={isUserScoped}
                  isUserEnabled={userPluginStatus?.isEnabled}
                  isSystemEnabled={item.installed?.isEnabled}
                />
              </div>
            )}
          </div>

          {/* User-scoped plugin info */}
          {showUserScopedInfo && <UserScopedInfo />}

          {/* Tags */}
          {hasTags && (
            <div className="flex flex-wrap gap-2">
              {item.tags!.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
          )}

          {/* Actions - moved above Configuration */}
          {showActions && (
            <>
              <div className="border-t" />
              <div className="space-y-4">
                <h4 className="font-medium">Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {item.actions!.map((action) => (
                    <ActionButton
                      key={action.id}
                      action={action}
                      isLoading={isLoading}
                      isExecuting={executingAction === action.id}
                      onExecute={() => {
                        setExecutingAction(action.id);
                        executeActionMutation.mutate({
                          id: item.installed!.id,
                          actionId: action.id,
                        });
                      }}
                      onPdfImport={() => setPdfResumeImportOpen(true)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Configuration Form - Collapsible (for SYSTEM-scoped or pre-install) */}
          {hasSystemConfig && (
            <>
              <div className="border-t" />
              <ConfigSection title="Configuration" isOpen={configOpen} onOpenChange={setConfigOpen}>
                <ConfigurationForm
                  schema={item.configSchema!}
                  values={configValues}
                  onChange={configOnChange}
                  onSave={configOnSave}
                  disabled={isLoading}
                  isSaving={updateConfigMutation.isPending}
                />
              </ConfigSection>
            </>
          )}

          {/* User Configuration Form - for USER-scoped plugins */}
          {hasUserConfig && (
            <>
              <div className="border-t" />
              {showConfiguredBanner && <ConfiguredBanner />}
              <ConfigSection
                title="Your Configuration"
                description="These settings are stored securely and only apply to your account."
                isOpen={userConfigOpen}
                onOpenChange={setUserConfigOpen}
              >
                <ConfigurationForm
                  schema={item.configSchema!}
                  values={userConfigValues}
                  onSave={(values) =>
                    saveUserConfigMutation.mutate({ catalogId: item.id, settings: values })
                  }
                  disabled={isLoading}
                  isSaving={saveUserConfigMutation.isPending}
                />
              </ConfigSection>
            </>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <ModalFooter
            isInstalled={item.isInstalled}
            isLoading={isLoading}
            uninstallIsPending={uninstallMutation.isPending}
            installIsPending={installMutation.isPending}
            onUninstall={() => uninstallMutation.mutate(item.installed!.id)}
            onInstall={() => installMutation.mutate(item.id)}
            toggleProps={toggleProps}
          />
        </DialogFooter>
      </DialogContent>

      {/* PDF Resume Import Modal */}
      <PdfResumeImportModal
        open={pdfResumeImportOpen}
        onOpenChange={setPdfResumeImportOpen}
      />
    </Dialog>
  );
}
