import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';
import { PluginRegistry } from './plugin.registry';
import { PluginAuditListener } from './plugin-audit.listener';
import { SlackNotificationsPlugin } from './extensions';
import { PrismaService } from '../database/prisma.service';

@Global()
@Module({
  controllers: [PluginsController],
  providers: [PluginsService, PluginRegistry, PluginAuditListener],
  exports: [PluginsService, PluginRegistry],
})
export class PluginsModule implements OnModuleInit {
  private readonly logger = new Logger(PluginsModule.name);

  constructor(
    private readonly registry: PluginRegistry,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit() {
    // Register built-in extensions
    this.logger.log('Registering built-in extensions...');

    const builtInExtensions = [
      new SlackNotificationsPlugin(),
      // Add more extensions here as they are implemented
    ];

    for (const plugin of builtInExtensions) {
      try {
        this.registry.register(plugin);
      } catch (error) {
        this.logger.error(`Failed to register ${plugin.metadata.name}: ${error}`);
      }
    }

    this.logger.log(`Registered ${builtInExtensions.length} built-in extension(s)`);

    // Restore enabled state for plugins that were enabled before restart
    await this.restoreEnabledPlugins();
  }

  private async restoreEnabledPlugins() {
    const enabledPlugins = await this.prisma.plugin.findMany({
      where: { isEnabled: true },
    });

    for (const plugin of enabledPlugins) {
      const instance = this.registry.get(plugin.name);
      if (instance?.onEnable) {
        try {
          await instance.onEnable(plugin.config as Record<string, unknown>);
          this.logger.log(`Restored enabled state for plugin: ${plugin.name}`);
        } catch (error) {
          this.logger.error(`Failed to restore plugin ${plugin.name}: ${error}`);
        }
      }
    }
  }
}
