import { Injectable, Logger } from '@nestjs/common';
import { GhostSyncPlugin } from '@ghostcast/plugin-sdk';

@Injectable()
export class PluginRegistry {
  private readonly logger = new Logger(PluginRegistry.name);
  private readonly plugins: Map<string, GhostSyncPlugin> = new Map();

  register(plugin: GhostSyncPlugin): void {
    this.plugins.set(plugin.metadata.name, plugin);
    this.logger.log(`Registered: ${plugin.metadata.name} v${plugin.metadata.version}`);
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  get(name: string): GhostSyncPlugin | undefined {
    return this.plugins.get(name);
  }

  getAll(): GhostSyncPlugin[] {
    return Array.from(this.plugins.values());
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }
}
