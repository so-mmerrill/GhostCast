import { ComponentType } from 'react';
import { LlmChatPanel, LlmChatPanelHeader } from './panels/LlmChatPanel';

type PanelComponent = ComponentType<{ onClose: () => void }>;

interface PanelRegistration {
  component: PanelComponent;
  headerComponent?: ComponentType;
  hideCloseButton?: boolean;
}

// Registry of plugin panel components
// Plugins register their panel components here
const pluginPanelRegistry: Record<string, Record<string, PanelRegistration>> = {};

export function registerPluginPanel(
  pluginId: string,
  slotId: string,
  registration: PanelRegistration
) {
  if (!pluginPanelRegistry[pluginId]) {
    pluginPanelRegistry[pluginId] = {};
  }
  pluginPanelRegistry[pluginId][slotId] = registration;
}

export function unregisterPluginPanel(pluginId: string, slotId: string) {
  if (pluginPanelRegistry[pluginId]) {
    delete pluginPanelRegistry[pluginId][slotId];
    if (Object.keys(pluginPanelRegistry[pluginId]).length === 0) {
      delete pluginPanelRegistry[pluginId];
    }
  }
}

export function getPluginPanelRegistration(
  pluginId: string,
  slotId: string
): PanelRegistration | null {
  return pluginPanelRegistry[pluginId]?.[slotId] ?? null;
}

export function hasPluginPanel(pluginId: string, slotId: string): boolean {
  return !!pluginPanelRegistry[pluginId]?.[slotId];
}

// Register built-in plugin panels
registerPluginPanel('openai-llm', 'openai-llm-chat', {
  component: LlmChatPanel,
  headerComponent: LlmChatPanelHeader,
  hideCloseButton: true,
});
