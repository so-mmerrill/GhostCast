import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CatalogWithInstallStatus, PluginScope, Role } from '@ghostcast/shared';
import { useIconTrayStore } from '@/stores/icon-tray-store';
import { getPluginPanelRegistration } from './plugin-panel-registry';
import { UserPluginStatus } from '@/types/user-plugins';
import { useAuth } from '@/features/auth/AuthProvider';

export function PluginUIManager() {
  const { register, unregister, unregisterByPlugin } = useIconTrayStore();
  const registeredPluginsRef = useRef<Set<string>>(new Set());
  const { hasRole } = useAuth();
  const isAdmin = hasRole(Role.ADMIN);

  // Admin-only: fetch full catalog for SYSTEM-scoped plugins
  const { data: catalog } = useQuery({
    queryKey: ['integrations', 'catalog'],
    queryFn: async () => {
      const response = await api.get<{ data: CatalogWithInstallStatus[] }>('/integrations/catalog');
      return response.data;
    },
    enabled: isAdmin,
  });

  // All users: fetch user-specific plugin statuses for USER-scoped plugins
  const { data: userPlugins } = useQuery({
    queryKey: ['user-plugins'],
    queryFn: async () => {
      const response = await api.get<{ data: UserPluginStatus[] }>('/user-plugins');
      return response.data;
    },
  });

  useEffect(() => {
    // Collect all plugins that should have icon tray slots
    const enabledPluginsWithTray: Array<{
      id: string;
      uiSlots: NonNullable<CatalogWithInstallStatus['uiSlots']>;
    }> = [];

    // 1. USER-scoped plugins: use userPlugins data (available to all users)
    if (userPlugins) {
      for (const up of userPlugins) {
        if (up.isEnabled && up.catalogItem.uiSlots?.iconTray) {
          enabledPluginsWithTray.push({
            id: up.catalogId,
            uiSlots: up.catalogItem.uiSlots,
          });
        }
      }
    }

    // 2. SYSTEM-scoped plugins: use catalog data (admin only)
    if (isAdmin && catalog) {
      for (const p of catalog) {
        if (
          p.isInstalled &&
          p.installed?.isEnabled &&
          p.scope === PluginScope.SYSTEM &&
          p.uiSlots?.iconTray
        ) {
          enabledPluginsWithTray.push({
            id: p.id,
            uiSlots: p.uiSlots,
          });
        }
      }
    }

    const currentPluginIds = new Set(enabledPluginsWithTray.map((p) => p.id));

    // Unregister plugins that are no longer enabled
    registeredPluginsRef.current.forEach((pluginId) => {
      if (!currentPluginIds.has(pluginId)) {
        unregisterByPlugin(pluginId);
        registeredPluginsRef.current.delete(pluginId);
      }
    });

    // Register new plugins
    enabledPluginsWithTray.forEach((plugin) => {
      // Skip if already registered
      if (registeredPluginsRef.current.has(plugin.id)) {
        return;
      }

      const slot = plugin.uiSlots.iconTray!;
      const panelRegistration = getPluginPanelRegistration(plugin.id, slot.slotId);

      if (panelRegistration) {
        register({
          id: slot.slotId,
          icon: slot.icon,
          tooltip: slot.tooltip,
          panelTitle: slot.panelTitle,
          PanelComponent: panelRegistration.component,
          priority: slot.priority ?? 100,
          badgeCount: slot.badgeCount,
          pluginId: plugin.id,
          windowWidth: slot.windowWidth ?? 400,
          windowHeight: slot.windowHeight ?? 500,
          hideCloseButton: panelRegistration.hideCloseButton,
          HeaderComponent: panelRegistration.headerComponent,
        });

        registeredPluginsRef.current.add(plugin.id);
      }
    });
  }, [catalog, userPlugins, isAdmin, register, unregister, unregisterByPlugin]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      registeredPluginsRef.current.forEach((pluginId) => {
        unregisterByPlugin(pluginId);
      });
      registeredPluginsRef.current.clear();
    };
  }, [unregisterByPlugin]);

  // This is a behavior-only component - no UI
  return null;
}
