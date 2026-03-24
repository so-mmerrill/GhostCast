import { useEffect, ComponentType } from 'react';
import { useIconTrayStore } from '@/stores/icon-tray-store';

interface UseIconTrayRegistrationOptions {
  id: string;
  icon: string;
  tooltip: string;
  panelTitle: string;
  PanelComponent: ComponentType<{ onClose: () => void }>;
  priority?: number;
  badgeCount?: number;
  pluginId?: string;
  windowWidth?: number;
  windowHeight?: number;
  enabled?: boolean;
}

export function useIconTrayRegistration({
  id,
  icon,
  tooltip,
  panelTitle,
  PanelComponent,
  priority = 100,
  badgeCount,
  pluginId,
  windowWidth = 400,
  windowHeight = 500,
  enabled = true,
}: UseIconTrayRegistrationOptions) {
  const { register, unregister, updateBadge } = useIconTrayStore();

  useEffect(() => {
    if (!enabled) {
      unregister(id);
      return;
    }

    register({
      id,
      icon,
      tooltip,
      panelTitle,
      PanelComponent,
      priority,
      badgeCount,
      pluginId,
      windowWidth,
      windowHeight,
    });

    return () => {
      unregister(id);
    };
  }, [
    id,
    icon,
    tooltip,
    panelTitle,
    PanelComponent,
    priority,
    pluginId,
    windowWidth,
    windowHeight,
    enabled,
    register,
    unregister,
  ]);

  // Update badge separately so it doesn't re-register
  useEffect(() => {
    if (enabled) {
      updateBadge(id, badgeCount);
    }
  }, [id, badgeCount, enabled, updateBadge]);
}
