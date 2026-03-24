import type { INestApplication } from '@nestjs/common';
import type { PluginHooks } from './hooks.interface.js';
import type { ExtensionPoints } from './extension-points.interface.js';

/**
 * Plugin metadata configuration
 */
export interface PluginMetadata {
  /** Unique plugin identifier */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable display name */
  displayName: string;
  /** Plugin description */
  description: string;
  /** Plugin author */
  author?: string;
  /** Plugin homepage/documentation URL */
  homepage?: string;
  /** Minimum GhostSync version required */
  minAppVersion?: string;
  /** Plugin dependencies */
  dependencies?: string[];
}

/**
 * Plugin configuration schema for admin UI
 */
export interface PluginConfigSchema {
  [key: string]: PluginConfigField;
}

export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'password' | 'textarea';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: { label: string; value: string | number }[]; // For select and multiselect types
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/**
 * Plugin health check result
 */
export interface PluginHealthCheck {
  healthy: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Main plugin interface
 * All GhostSync plugins must implement this interface
 */
export interface GhostSyncPlugin {
  /** Plugin metadata */
  readonly metadata: PluginMetadata;

  /** Configuration schema for admin UI */
  readonly configSchema?: PluginConfigSchema;

  /**
   * Called when the plugin is loaded into memory
   * Use for initialization that doesn't depend on config
   */
  onLoad?(app: INestApplication): Promise<void>;

  /**
   * Called when the plugin is enabled
   * @param config - Plugin configuration from database
   */
  onEnable?(config: Record<string, unknown>): Promise<void>;

  /**
   * Called when the plugin is disabled
   */
  onDisable?(): Promise<void>;

  /**
   * Called when the plugin is unloaded
   * Use for cleanup
   */
  onUnload?(): Promise<void>;

  /**
   * Called when plugin configuration is updated
   * @param oldConfig - Previous configuration
   * @param newConfig - New configuration
   */
  onConfigUpdate?(
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>
  ): Promise<void>;

  /**
   * Health check for monitoring plugin status
   */
  healthCheck?(): Promise<PluginHealthCheck>;

  /**
   * Extension points the plugin registers
   */
  getExtensionPoints?(): ExtensionPoints;

  /**
   * Event hooks the plugin subscribes to
   */
  getHooks?(): Partial<PluginHooks>;
}

/**
 * Plugin registration result
 */
export interface PluginRegistration {
  success: boolean;
  plugin?: GhostSyncPlugin;
  error?: string;
}

/**
 * Plugin runtime state
 */
export interface PluginState {
  name: string;
  version: string;
  isEnabled: boolean;
  isHealthy: boolean;
  config: Record<string, unknown>;
  loadedAt?: Date;
  enabledAt?: Date;
  lastHealthCheck?: Date;
  error?: string;
}
