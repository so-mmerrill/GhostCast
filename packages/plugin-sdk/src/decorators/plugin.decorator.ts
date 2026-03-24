import type { PluginMetadata } from '../interfaces/plugin.interface.js';

/**
 * Symbol for storing plugin metadata
 */
export const PLUGIN_METADATA_KEY = Symbol('ghostsync:plugin:metadata');

/**
 * Decorator to define plugin metadata
 * @param metadata - Plugin metadata
 */
export function Plugin(metadata: PluginMetadata): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, metadata, target);
    return target;
  };
}

/**
 * Get plugin metadata from a class
 * @param target - Plugin class
 */
export function getPluginMetadata(target: unknown): PluginMetadata | undefined {
  if (typeof target === 'function') {
    return Reflect.getMetadata(PLUGIN_METADATA_KEY, target);
  }
  if (typeof target === 'object' && target !== null) {
    return Reflect.getMetadata(PLUGIN_METADATA_KEY, target.constructor);
  }
  return undefined;
}
