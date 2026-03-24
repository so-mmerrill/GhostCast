import { useState, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Puzzle, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { IntegrationDetailModal } from '@/components/integrations/IntegrationDetailModal';
import { UserPluginDetailModal } from '@/components/integrations/UserPluginDetailModal';
import { CatalogWithInstallStatus, PluginType, Role } from '@ghostcast/shared';
import { UserPluginStatus } from '@/types/user-plugins';

export const Route = createFileRoute('/_authenticated/integrations')({
  component: IntegrationsPage,
});

function LoadingGrid({ count }: Readonly<{ count: number }>) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

function EmptyState({ message }: Readonly<{ message: string }>) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      {message}
    </div>
  );
}

function getAdminEmptyMessage(searchQuery: string, activeTab: string): string {
  if (searchQuery) {
    return `No results found for "${searchQuery}"`;
  }
  return `No ${activeTab === 'all' ? 'integrations or extensions' : activeTab} found`;
}

function getUserEmptyMessage(searchQuery: string, hasPlugins: boolean, activeTab: string): string {
  if (searchQuery) {
    return `No results found for "${searchQuery}"`;
  }
  if (!hasPlugins) {
    return 'No plugins available. Contact your administrator to install plugins.';
  }
  return `No ${activeTab === 'enabled' ? 'enabled ' : ''}plugins found`;
}

interface AdminTabsContentProps {
  readonly isLoading: boolean;
  readonly filteredItems: CatalogWithInstallStatus[];
  readonly searchQuery: string;
  readonly activeTab: string;
  readonly onSelectItem: (item: CatalogWithInstallStatus) => void;
}

function AdminTabsContent({
  isLoading,
  filteredItems,
  searchQuery,
  activeTab,
  onSelectItem,
}: Readonly<AdminTabsContentProps>) {
  if (isLoading) {
    return <LoadingGrid count={6} />;
  }
  if (filteredItems.length === 0) {
    return <EmptyState message={getAdminEmptyMessage(searchQuery, activeTab)} />;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {filteredItems.map((item) => (
        <IntegrationCard key={item.id} item={item} onClick={() => onSelectItem(item)} />
      ))}
    </div>
  );
}

interface UserTabsContentProps {
  readonly isLoading: boolean;
  readonly filteredUserPlugins: UserPluginStatus[];
  readonly hasPlugins: boolean;
  readonly searchQuery: string;
  readonly activeTab: string;
  readonly onSelectPlugin: (plugin: UserPluginStatus) => void;
}

function userPluginToCardItem(plugin: UserPluginStatus): CatalogWithInstallStatus {
  return {
    ...plugin.catalogItem,
    isInstalled: true,
    installed: {
      id: plugin.pluginId,
      catalogId: plugin.catalogId,
      type: plugin.catalogItem.type,
      scope: plugin.catalogItem.scope,
      name: plugin.catalogItem.name,
      displayName: plugin.catalogItem.displayName,
      description: plugin.catalogItem.description,
      version: plugin.catalogItem.version,
      isEnabled: plugin.isEnabled,
      config: plugin.config,
      isLoaded: true,
      installedAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

function UserTabsContent({
  isLoading,
  filteredUserPlugins,
  hasPlugins,
  searchQuery,
  activeTab,
  onSelectPlugin,
}: Readonly<UserTabsContentProps>) {
  if (isLoading) {
    return <LoadingGrid count={3} />;
  }
  if (filteredUserPlugins.length === 0) {
    return <EmptyState message={getUserEmptyMessage(searchQuery, hasPlugins, activeTab)} />;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {filteredUserPlugins.map((plugin) => (
        <IntegrationCard
          key={plugin.catalogId}
          item={userPluginToCardItem(plugin)}
          onClick={() => onSelectPlugin(plugin)}
        />
      ))}
    </div>
  );
}

function IntegrationsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole(Role.ADMIN);

  const [selectedItem, setSelectedItem] = useState<CatalogWithInstallStatus | null>(null);
  const [selectedUserPlugin, setSelectedUserPlugin] = useState<UserPluginStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'integrations' | 'extensions' | 'installed' | 'enabled'>('all');

  // Admin view: fetch full catalog
  const { data: catalog = [], isLoading: catalogLoading } = useQuery({
    queryKey: ['integrations', 'catalog'],
    queryFn: async () => {
      const response = await api.get<{ data: CatalogWithInstallStatus[] }>('/integrations/catalog');
      return response.data;
    },
    enabled: isAdmin,
  });

  // User view: fetch user-scoped plugins only
  const { data: userPlugins = [], isLoading: userPluginsLoading } = useQuery({
    queryKey: ['user-plugins'],
    queryFn: async () => {
      const response = await api.get<{ data: UserPluginStatus[] }>('/user-plugins');
      return response.data;
    },
    enabled: !isAdmin,
  });

  const isLoading = isAdmin ? catalogLoading : userPluginsLoading;

  // Sync selectedItem with catalog data when it updates (admin only)
  useEffect(() => {
    if (isAdmin && selectedItem && catalog.length > 0) {
      const updated = catalog.find((item) => item.id === selectedItem.id);
      if (updated && updated !== selectedItem) {
        setSelectedItem(updated);
      }
    }
  }, [catalog, selectedItem, isAdmin]);

  // Sync selectedUserPlugin with userPlugins data when it updates
  useEffect(() => {
    if (!isAdmin && selectedUserPlugin && userPlugins.length > 0) {
      const updated = userPlugins.find((p) => p.catalogId === selectedUserPlugin.catalogId);
      if (updated && updated !== selectedUserPlugin) {
        setSelectedUserPlugin(updated);
      }
    }
  }, [userPlugins, selectedUserPlugin, isAdmin]);

  // Admin filtering
  const filteredItems = catalog.filter((item) => {
    const matchesSearch =
      item.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    switch (activeTab) {
      case 'integrations':
        return item.type === PluginType.INTEGRATION;
      case 'extensions':
        return item.type === PluginType.EXTENSION;
      case 'installed':
        return item.isInstalled;
      default:
        return true;
    }
  });

  // User filtering
  const filteredUserPlugins = userPlugins.filter((plugin) => {
    const matchesSearch =
      plugin.catalogItem.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.catalogItem.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.catalogItem.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeTab === 'enabled') {
      return plugin.isEnabled;
    }
    return true;
  });

  // Counts for admin tabs
  const adminCounts = {
    all: catalog.length,
    integrations: catalog.filter((i) => i.type === PluginType.INTEGRATION).length,
    extensions: catalog.filter((i) => i.type === PluginType.EXTENSION).length,
    installed: catalog.filter((i) => i.isInstalled).length,
  };

  // Counts for user tabs
  const userCounts = {
    all: userPlugins.length,
    enabled: userPlugins.filter((p) => p.isEnabled).length,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <Puzzle className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isAdmin ? 'Plugins' : 'My Plugins'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? 'Connect your tools and extend GhostCast functionality'
                : 'Enable plugins for your account'}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search plugins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabs - different for admin vs user */}
      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="all">All ({adminCounts.all})</TabsTrigger>
            <TabsTrigger value="integrations">Integrations ({adminCounts.integrations})</TabsTrigger>
            <TabsTrigger value="extensions">Extensions ({adminCounts.extensions})</TabsTrigger>
            <TabsTrigger value="installed">Installed ({adminCounts.installed})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <AdminTabsContent
              isLoading={isLoading}
              filteredItems={filteredItems}
              searchQuery={searchQuery}
              activeTab={activeTab}
              onSelectItem={setSelectedItem}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="all">All ({userCounts.all})</TabsTrigger>
            <TabsTrigger value="enabled">Enabled ({userCounts.enabled})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <UserTabsContent
              isLoading={isLoading}
              filteredUserPlugins={filteredUserPlugins}
              hasPlugins={userPlugins.length > 0}
              searchQuery={searchQuery}
              activeTab={activeTab}
              onSelectPlugin={setSelectedUserPlugin}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Detail Modals */}
      {isAdmin && (
        <IntegrationDetailModal
          item={selectedItem}
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
        />
      )}
      {!isAdmin && (
        <UserPluginDetailModal
          plugin={selectedUserPlugin}
          open={!!selectedUserPlugin}
          onOpenChange={(open) => !open && setSelectedUserPlugin(null)}
        />
      )}
    </div>
  );
}
