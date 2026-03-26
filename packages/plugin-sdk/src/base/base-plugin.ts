import type { INestApplication } from '@nestjs/common';
import type { CatalogItem } from '@ghostcast/shared';
import type {
  GhostSyncPlugin,
  PluginMetadata,
  PluginConfigSchema,
  PluginHealthCheck,
} from '../interfaces/plugin.interface.js';
import type { PluginHooks } from '../interfaces/hooks.interface.js';
import type { ExtensionPoints } from '../interfaces/extension-points.interface.js';

/**
 * Base class for GhostSync plugins
 * Provides default implementations and utility methods
 */
export abstract class BasePlugin implements GhostSyncPlugin {
  abstract readonly metadata: PluginMetadata;

  readonly configSchema?: PluginConfigSchema;

  protected app?: INestApplication;
  protected config: Record<string, unknown> = {};
  protected isEnabled = false;

  /**
   * Called when the plugin is loaded into memory
   */
  async onLoad(app: INestApplication): Promise<void> {
    this.app = app;
    this.log('Plugin loaded');
  }

  /**
   * Called when the plugin is enabled
   */
  async onEnable(config: Record<string, unknown>): Promise<void> {
    this.config = config;
    this.isEnabled = true;
    this.log('Plugin enabled');
  }

  /**
   * Called when the plugin is disabled
   */
  async onDisable(): Promise<void> {
    this.isEnabled = false;
    this.log('Plugin disabled');
  }

  /**
   * Called when the plugin is unloaded
   */
  async onUnload(): Promise<void> {
    this.app = undefined;
    this.config = {};
    this.log('Plugin unloaded');
  }

  /**
   * Called when plugin configuration is updated
   */
  async onConfigUpdate(
    _oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>
  ): Promise<void> {
    this.config = newConfig;
    this.log('Configuration updated');
  }

  /**
   * Default health check - override for custom logic
   */
  async healthCheck(): Promise<PluginHealthCheck> {
    return {
      healthy: this.isEnabled,
      message: this.isEnabled ? 'Plugin is running' : 'Plugin is disabled',
    };
  }

  /**
   * Override to provide extension points
   */
  getExtensionPoints(): ExtensionPoints {
    return {};
  }

  /**
   * Override to provide hooks
   */
  getHooks(): Partial<PluginHooks> {
    return {};
  }

  /**
   * Override to self-describe this plugin's catalog entry.
   * Plugins that return a CatalogItem here are dynamically registered
   * in the catalog without needing a hardcoded entry in CatalogService.
   */
  getCatalogEntry(): CatalogItem | undefined {
    return undefined;
  }

  // ===========================================
  // Utility Methods
  // ===========================================

  /**
   * Get a configuration value with type safety
   */
  protected getConfig<T>(key: string, defaultValue?: T): T {
    const value = this.config[key];
    return (value === undefined ? defaultValue : value) as T;
  }

  /**
   * Log a message with plugin prefix
   */
  protected log(message: string, level: 'log' | 'warn' | 'error' = 'log'): void {
    const prefix = `[${this.metadata.name}]`;
    console[level](`${prefix} ${message}`);
  }

  /**
   * Emit an event through the NestJS event emitter (if available)
   */
  protected async emit(event: string, payload: unknown): Promise<void> {
    if (!this.app) return;

    try {
      const eventEmitter = this.app.get('EventEmitter2', { strict: false });
      if (eventEmitter) {
        eventEmitter.emit(event, payload);
      }
    } catch {
      // Event emitter not available
    }
  }

  /**
   * Get a service from the NestJS container
   */
  protected getService<T>(token: unknown): T | undefined {
    if (!this.app) return undefined;

    try {
      return this.app.get<T>(token as never, { strict: false });
    } catch {
      return undefined;
    }
  }
}
