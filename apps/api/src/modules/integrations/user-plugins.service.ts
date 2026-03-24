import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CatalogService } from './catalog.service';
import { PluginScope, CatalogItem } from '@ghostcast/shared';

export interface UserPluginStatus {
  catalogId: string;
  pluginId: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  catalogItem: CatalogItem;
}

@Injectable()
export class UserPluginsService {
  private readonly logger = new Logger(UserPluginsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * Get all USER-scoped plugins with their status for a specific user
   */
  async getUserPlugins(userId: string): Promise<UserPluginStatus[]> {
    const userScopedCatalog = this.catalogService.findByScope(PluginScope.USER);
    const results: UserPluginStatus[] = [];

    for (const catalogItem of userScopedCatalog) {
      // Find the installed plugin (system-level installation)
      const plugin = await this.prisma.plugin.findFirst({
        where: {
          OR: [{ catalogId: catalogItem.id }, { name: catalogItem.name }],
        },
      });

      if (!plugin) {
        // Plugin not installed at system level, skip
        continue;
      }

      // Find user-specific enablement
      const userPlugin = await this.prisma.userPlugin.findUnique({
        where: {
          userId_pluginId: { userId, pluginId: plugin.id },
        },
      });

      results.push({
        catalogId: catalogItem.id,
        pluginId: plugin.id,
        isEnabled: userPlugin?.isEnabled ?? false,
        config: (userPlugin?.config as Record<string, unknown>) ?? {},
        catalogItem,
      });
    }

    return results;
  }

  /**
   * Check if a specific plugin is enabled for a user
   */
  async isPluginEnabledForUser(
    userId: string,
    catalogId: string,
  ): Promise<boolean> {
    const plugin = await this.prisma.plugin.findFirst({
      where: { catalogId },
    });

    if (!plugin) {
      return false;
    }

    const userPlugin = await this.prisma.userPlugin.findUnique({
      where: {
        userId_pluginId: { userId, pluginId: plugin.id },
      },
    });

    return userPlugin?.isEnabled ?? false;
  }

  /**
   * Get a user's config for a specific plugin (if enabled)
   */
  async getUserPluginConfig(
    userId: string,
    catalogId: string,
  ): Promise<Record<string, unknown> | null> {
    const plugin = await this.prisma.plugin.findFirst({
      where: { catalogId },
    });

    if (!plugin) {
      return null;
    }

    const userPlugin = await this.prisma.userPlugin.findUnique({
      where: {
        userId_pluginId: { userId, pluginId: plugin.id },
      },
    });

    if (!userPlugin?.isEnabled) {
      return null;
    }

    return userPlugin.config as Record<string, unknown>;
  }

  /**
   * Enable a USER-scoped plugin for a specific user
   */
  async enableForUser(userId: string, catalogId: string): Promise<UserPluginStatus> {
    const catalogItem = this.catalogService.findById(catalogId);
    if (!catalogItem) {
      throw new NotFoundException(`Catalog item "${catalogId}" not found`);
    }

    if (catalogItem.scope !== PluginScope.USER) {
      throw new BadRequestException(
        `Plugin "${catalogItem.displayName}" is a system plugin and cannot be enabled per-user`,
      );
    }

    // Find the installed plugin
    const plugin = await this.prisma.plugin.findFirst({
      where: {
        OR: [{ catalogId }, { name: catalogItem.name }],
      },
    });

    if (!plugin) {
      throw new BadRequestException(
        `Plugin "${catalogItem.displayName}" must be installed by an admin first`,
      );
    }

    // Create or update user plugin record
    const userPlugin = await this.prisma.userPlugin.upsert({
      where: {
        userId_pluginId: { userId, pluginId: plugin.id },
      },
      create: {
        userId,
        pluginId: plugin.id,
        isEnabled: true,
        config: {},
      },
      update: {
        isEnabled: true,
      },
    });

    this.logger.log(
      `User ${userId} enabled plugin: ${catalogItem.displayName}`,
    );

    return {
      catalogId,
      pluginId: plugin.id,
      isEnabled: userPlugin.isEnabled,
      config: userPlugin.config as Record<string, unknown>,
      catalogItem,
    };
  }

  /**
   * Disable a USER-scoped plugin for a specific user
   */
  async disableForUser(userId: string, catalogId: string): Promise<UserPluginStatus> {
    const catalogItem = this.catalogService.findById(catalogId);
    if (!catalogItem) {
      throw new NotFoundException(`Catalog item "${catalogId}" not found`);
    }

    if (catalogItem.scope !== PluginScope.USER) {
      throw new BadRequestException(
        `Plugin "${catalogItem.displayName}" is a system plugin and cannot be disabled per-user`,
      );
    }

    const plugin = await this.prisma.plugin.findFirst({
      where: {
        OR: [{ catalogId }, { name: catalogItem.name }],
      },
    });

    if (!plugin) {
      throw new NotFoundException(`Plugin "${catalogItem.displayName}" is not installed`);
    }

    const userPlugin = await this.prisma.userPlugin.upsert({
      where: {
        userId_pluginId: { userId, pluginId: plugin.id },
      },
      create: {
        userId,
        pluginId: plugin.id,
        isEnabled: false,
        config: {},
      },
      update: {
        isEnabled: false,
      },
    });

    this.logger.log(
      `User ${userId} disabled plugin: ${catalogItem.displayName}`,
    );

    return {
      catalogId,
      pluginId: plugin.id,
      isEnabled: userPlugin.isEnabled,
      config: userPlugin.config as Record<string, unknown>,
      catalogItem,
    };
  }

  /**
   * Update user-specific configuration for a plugin
   */
  async updateUserConfig(
    userId: string,
    catalogId: string,
    config: Record<string, unknown>,
  ): Promise<UserPluginStatus> {
    const catalogItem = this.catalogService.findById(catalogId);
    if (!catalogItem) {
      throw new NotFoundException(`Catalog item "${catalogId}" not found`);
    }

    if (catalogItem.scope !== PluginScope.USER) {
      throw new BadRequestException(
        `Plugin "${catalogItem.displayName}" is a system plugin`,
      );
    }

    const plugin = await this.prisma.plugin.findFirst({
      where: {
        OR: [{ catalogId }, { name: catalogItem.name }],
      },
    });

    if (!plugin) {
      throw new NotFoundException(`Plugin "${catalogItem.displayName}" is not installed`);
    }

    const userPlugin = await this.prisma.userPlugin.upsert({
      where: {
        userId_pluginId: { userId, pluginId: plugin.id },
      },
      create: {
        userId,
        pluginId: plugin.id,
        isEnabled: false,
        config: config as object,
      },
      update: {
        config: config as object,
      },
    });

    this.logger.log(
      `User ${userId} updated config for plugin: ${catalogItem.displayName}`,
    );

    return {
      catalogId,
      pluginId: plugin.id,
      isEnabled: userPlugin.isEnabled,
      config: userPlugin.config as Record<string, unknown>,
      catalogItem,
    };
  }
}
