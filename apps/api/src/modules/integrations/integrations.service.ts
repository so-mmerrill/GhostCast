import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PluginRegistry } from '../../plugins/plugin.registry';
import { CatalogService } from './catalog.service';
import {
  CatalogWithInstallStatus,
  InstalledPlugin,
  PluginType,
  PluginScope,
} from '@ghostcast/shared';
import { Plugin, PluginType as PrismaPluginType, PluginScope as PrismaPluginScope } from '@ghostcast/database';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistry,
    private readonly catalogService: CatalogService
  ) {}

  async getCatalogWithStatus(): Promise<CatalogWithInstallStatus[]> {
    const catalog = await this.catalogService.findAllWithDynamicOptions();
    const installed = await this.prisma.plugin.findMany();

    return catalog.map((item) => {
      const plugin = installed.find(
        (p) => p.catalogId === item.id || p.name === item.name
      );
      return {
        ...item,
        isInstalled: !!plugin,
        installed: plugin ? this.mapToInstalledPlugin(plugin) : undefined,
      };
    });
  }

  async getInstalled(): Promise<InstalledPlugin[]> {
    const plugins = await this.prisma.plugin.findMany({
      orderBy: { installedAt: 'desc' },
    });
    return plugins.map((p) => this.mapToInstalledPlugin(p));
  }

  async getById(id: string): Promise<InstalledPlugin> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id } });
    if (!plugin) {
      throw new NotFoundException(`Plugin ${id} not found`);
    }
    return this.mapToInstalledPlugin(plugin);
  }

  async install(
    catalogId: string,
    config: Record<string, unknown> = {}
  ): Promise<InstalledPlugin> {
    const catalogItem = this.catalogService.findById(catalogId);
    if (!catalogItem) {
      throw new NotFoundException(`Catalog item ${catalogId} not found`);
    }

    // Check if already installed
    const existing = await this.prisma.plugin.findFirst({
      where: {
        OR: [{ catalogId }, { name: catalogItem.name }],
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Plugin "${catalogItem.displayName}" is already installed`
      );
    }

    // Apply default values from config schema
    const finalConfig = { ...config };
    if (catalogItem.configSchema) {
      for (const field of catalogItem.configSchema) {
        if (!(field.key in finalConfig) && field.default !== undefined) {
          finalConfig[field.key] = field.default;
        }
      }
    }

    const plugin = await this.prisma.plugin.create({
      data: {
        name: catalogItem.name,
        catalogId,
        type: catalogItem.type as unknown as PrismaPluginType,
        scope: catalogItem.scope as unknown as PrismaPluginScope,
        version: catalogItem.version,
        displayName: catalogItem.displayName,
        description: catalogItem.description,
        config: finalConfig as object,
        isEnabled: false, // For SYSTEM plugins; USER plugins use UserPlugin table
      },
    });

    this.logger.log(`Installed plugin: ${catalogItem.displayName}`);
    return this.mapToInstalledPlugin(plugin);
  }

  async uninstall(id: string): Promise<void> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id } });
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    // Disable first if enabled
    if (plugin.isEnabled) {
      await this.disable(id);
    }

    await this.prisma.plugin.delete({ where: { id } });
    this.logger.log(`Uninstalled plugin: ${plugin.displayName || plugin.name}`);
  }

  async enable(id: string): Promise<InstalledPlugin> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id } });
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    if (plugin.isEnabled) {
      return this.mapToInstalledPlugin(plugin);
    }

    // Call lifecycle hook if plugin is loaded
    const instance = this.registry.get(plugin.name);
    if (instance?.onEnable) {
      try {
        await instance.onEnable(plugin.config as Record<string, unknown>);
      } catch (error) {
        this.logger.error(`Failed to enable plugin ${plugin.name}`, error);
        throw new BadRequestException(`Failed to enable plugin: ${error}`);
      }
    }

    const updated = await this.prisma.plugin.update({
      where: { id },
      data: { isEnabled: true },
    });

    this.logger.log(`Enabled plugin: ${plugin.displayName || plugin.name}`);
    return this.mapToInstalledPlugin(updated);
  }

  async disable(id: string): Promise<InstalledPlugin> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id } });
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    if (!plugin.isEnabled) {
      return this.mapToInstalledPlugin(plugin);
    }

    // Call lifecycle hook if plugin is loaded
    const instance = this.registry.get(plugin.name);
    if (instance?.onDisable) {
      try {
        await instance.onDisable();
      } catch (error) {
        this.logger.error(`Failed to disable plugin ${plugin.name}`, error);
        // Continue anyway to ensure plugin is disabled in DB
      }
    }

    const updated = await this.prisma.plugin.update({
      where: { id },
      data: { isEnabled: false },
    });

    this.logger.log(`Disabled plugin: ${plugin.displayName || plugin.name}`);
    return this.mapToInstalledPlugin(updated);
  }

  async updateConfig(
    id: string,
    config: Record<string, unknown>
  ): Promise<InstalledPlugin> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id } });
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    const oldConfig = plugin.config as Record<string, unknown>;

    // Call lifecycle hook if plugin is loaded
    const instance = this.registry.get(plugin.name);
    if (instance?.onConfigUpdate) {
      try {
        await instance.onConfigUpdate(oldConfig, config);
      } catch (error) {
        this.logger.error(
          `Failed to update config for plugin ${plugin.name}`,
          error
        );
        throw new BadRequestException(`Failed to update config: ${error}`);
      }
    }

    const updated = await this.prisma.plugin.update({
      where: { id },
      data: { config: config as object },
    });

    this.logger.log(
      `Updated config for plugin: ${plugin.displayName || plugin.name}`
    );
    return this.mapToInstalledPlugin(updated);
  }

  async getConfigByCatalogId(
    catalogId: string
  ): Promise<Record<string, unknown> | null> {
    const plugin = await this.prisma.plugin.findFirst({
      where: {
        AND: [{ catalogId: catalogId }, { isEnabled: true }],
      },
    });
    if (!plugin) {
      return null;
    }
    return plugin.config as Record<string, unknown>;
  }

  /**
   * Programmatically update specific config fields by catalog ID.
   * Merges fieldUpdates into existing config. Skips lifecycle hooks.
   */
  async updateConfigFieldByCatalogId(
    catalogId: string,
    fieldUpdates: Record<string, unknown>,
  ): Promise<void> {
    const plugin = await this.prisma.plugin.findFirst({
      where: { catalogId, isEnabled: true },
    });
    if (!plugin) return;

    const currentConfig = (plugin.config as Record<string, unknown>) || {};
    const mergedConfig = { ...currentConfig, ...fieldUpdates };

    await this.prisma.plugin.update({
      where: { id: plugin.id },
      data: { config: mergedConfig as object },
    });
  }

  async checkHealth(id: string): Promise<{ healthy: boolean; message?: string }> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id } });
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    const instance = this.registry.get(plugin.name);
    if (!instance?.healthCheck) {
      return { healthy: true, message: 'No health check available' };
    }

    try {
      const result = await instance.healthCheck();
      return { healthy: result.healthy, message: result.message };
    } catch (error) {
      return { healthy: false, message: String(error) };
    }
  }

  async executeAction(
    id: string,
    actionId: string,
    triggeredBy?: string,
  ): Promise<unknown> {
    const plugin = await this.prisma.plugin.findUnique({ where: { id } });
    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    if (!plugin.isEnabled) {
      throw new BadRequestException('Plugin is not enabled');
    }

    // Get catalog item to validate action exists
    const catalogItem = this.catalogService.findById(plugin.catalogId || '');
    if (!catalogItem) {
      throw new NotFoundException('Catalog item not found');
    }

    const action = catalogItem.actions?.find((a) => a.id === actionId);
    if (!action) {
      throw new NotFoundException(`Action "${actionId}" not found for this integration`);
    }

    // Dispatch to the appropriate handler based on the integration
    // This will be extended as more integrations with actions are added
    const result = await this.dispatchAction(plugin.catalogId || plugin.name, actionId, triggeredBy);

    this.logger.log(`Executed action "${actionId}" for plugin: ${plugin.displayName || plugin.name}`);
    return result;
  }

  private async dispatchAction(
    catalogId: string,
    actionId: string,
    triggeredBy?: string,
  ): Promise<unknown> {
    // Action handlers are registered by integration modules
    const handler = this.actionHandlers.get(`${catalogId}:${actionId}`);
    if (!handler) {
      throw new BadRequestException(`No handler registered for action "${actionId}" on "${catalogId}"`);
    }
    return handler(triggeredBy);
  }

  // Action handler registry
  private readonly actionHandlers = new Map<string, (triggeredBy?: string) => Promise<unknown>>();

  registerActionHandler(
    catalogId: string,
    actionId: string,
    handler: (triggeredBy?: string) => Promise<unknown>,
  ): void {
    this.actionHandlers.set(`${catalogId}:${actionId}`, handler);
    this.logger.debug(`Registered action handler: ${catalogId}:${actionId}`);
  }

  private mapToInstalledPlugin(plugin: Plugin): InstalledPlugin {
    return {
      id: plugin.id,
      catalogId: plugin.catalogId,
      type: plugin.type as unknown as PluginType,
      scope: (plugin as unknown as { scope: string }).scope as unknown as PluginScope,
      name: plugin.name,
      displayName: plugin.displayName,
      description: plugin.description,
      version: plugin.version,
      isEnabled: plugin.isEnabled,
      config: plugin.config as Record<string, unknown>,
      isLoaded: this.registry.has(plugin.name),
      installedAt: plugin.installedAt,
      updatedAt: plugin.updatedAt,
    };
  }
}
