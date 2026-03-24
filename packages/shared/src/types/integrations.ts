// ===========================================
// Plugin Type Enum (mirrored from Prisma)
// ===========================================

export enum PluginType {
  INTEGRATION = 'INTEGRATION',
  EXTENSION = 'EXTENSION',
}

// ===========================================
// Plugin Scope Enum
// ===========================================

/**
 * Defines whether a plugin is system-wide or per-user
 * - SYSTEM: Enabled globally for all users (e.g., Slack, Kantata)
 * - USER: Per-user enablement, not shared between users (e.g., Quip, AI Assistant)
 */
export enum PluginScope {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
}

// ===========================================
// Integration Categories
// ===========================================

export enum IntegrationCategory {
  DATA_SYNC = 'Data Sync',
  AI_ML = 'AI & Machine Learning',
  COMMUNICATION = 'Communication',
  PRODUCTIVITY = 'Productivity',
  ANALYTICS = 'Analytics',
  CUSTOM = 'Custom',
}

// ===========================================
// UI Slot Types for Icon Tray
// ===========================================

export interface IconTraySlotConfig {
  /** Unique identifier for this slot registration */
  slotId: string;
  /** Lucide icon name to display in the tray */
  icon: string;
  /** Tooltip text when hovering over the icon */
  tooltip: string;
  /** Panel title displayed in the window header */
  panelTitle: string;
  /** Priority for ordering icons (lower = further left) */
  priority?: number;
  /** Badge count to display (optional) */
  badgeCount?: number;
  /** Window width in pixels (default 400) */
  windowWidth?: number;
  /** Window height in pixels (default 500) */
  windowHeight?: number;
}

export interface PluginUISlots {
  /** Icon tray slot configuration */
  iconTray?: IconTraySlotConfig;
}

// ===========================================
// Plugin Action Types
// ===========================================

export interface PluginAction {
  /** Unique identifier for the action */
  id: string;
  /** Display label for the action button */
  label: string;
  /** Optional description shown as tooltip */
  description?: string;
  /** Lucide icon name */
  icon?: string;
  /** Whether this action is dangerous (shows confirmation) */
  dangerous?: boolean;
}

// ===========================================
// Configuration Schema Types
// ===========================================

export type PluginConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'password'
  | 'textarea'
  | 'syncPipeline';

export interface SyncPipelineStep {
  order: number;
  actionId: string;
}

export interface PluginConfigSchemaField {
  key: string;
  type: PluginConfigFieldType;
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: { label: string; value: string | number }[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  /** For syncPipeline type: available actions the user can add to the pipeline */
  pipelineActions?: { id: string; label: string }[];
  /** Group name — fields with the same group are rendered side-by-side in a row */
  group?: string;
}

// ===========================================
// Catalog Types
// ===========================================

export interface CatalogItem {
  id: string;
  type: PluginType;
  /**
   * Plugin scope determines enablement model:
   * - SYSTEM: Single global enable/disable for all users (admin controlled)
   * - USER: Per-user enable/disable, each user manages independently
   */
  scope: PluginScope;
  name: string;
  displayName: string;
  description: string;
  icon: string; // Lucide icon name
  category: IntegrationCategory;
  author: string;
  version: string;
  homepage?: string;
  configSchema?: PluginConfigSchemaField[];
  requiredPermissions?: string[];
  /**
   * Minimum role required to use this plugin's features.
   * Roles are hierarchical: ADMIN > MANAGER > SCHEDULER > MEMBER
   */
  requiredRole?: 'ADMIN' | 'MANAGER' | 'SCHEDULER' | 'MEMBER';
  /**
   * IDs of other plugins that must be enabled for this plugin to work.
   * The plugin will show as unavailable if dependencies are not met.
   */
  dependencies?: string[];
  tags?: string[];
  uiSlots?: PluginUISlots;
  /** Actions that can be triggered for this integration */
  actions?: PluginAction[];
}

// ===========================================
// Installed Plugin Types
// ===========================================

export interface InstalledPlugin {
  id: string;
  catalogId: string | null;
  type: PluginType;
  scope: PluginScope;
  name: string;
  displayName: string | null;
  description: string | null;
  version: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  isLoaded: boolean;
  isHealthy?: boolean;
  installedAt: Date;
  updatedAt: Date;
}

// ===========================================
// Combined View Types
// ===========================================

export interface CatalogWithInstallStatus extends CatalogItem {
  installed?: InstalledPlugin;
  isInstalled: boolean;
}

// ===========================================
// API Input Types
// ===========================================

export interface InstallPluginInput {
  config?: Record<string, unknown>;
}

export interface UpdatePluginConfigInput {
  config: Record<string, unknown>;
}
