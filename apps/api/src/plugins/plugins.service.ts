import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PluginRegistry } from './plugin.registry';

@Injectable()
export class PluginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistry
  ) {}

  async findAll() {
    const plugins = await this.prisma.plugin.findMany({
      orderBy: { name: 'asc' },
    });

    return plugins.map((plugin) => ({
      ...plugin,
      isLoaded: this.registry.has(plugin.name),
    }));
  }

  async findById(id: string) {
    const plugin = await this.prisma.plugin.findUnique({ where: { id } });
    if (!plugin) throw new NotFoundException('Plugin not found');

    return {
      ...plugin,
      isLoaded: this.registry.has(plugin.name),
      metadata: this.registry.get(plugin.name)?.metadata,
    };
  }

  async enable(id: string) {
    const plugin = await this.findById(id);
    const instance = this.registry.get(plugin.name);

    if (instance?.onEnable) {
      await instance.onEnable(plugin.config as Record<string, unknown>);
    }

    return this.prisma.plugin.update({
      where: { id },
      data: { isEnabled: true },
    });
  }

  async disable(id: string) {
    const plugin = await this.findById(id);
    const instance = this.registry.get(plugin.name);

    if (instance?.onDisable) {
      await instance.onDisable();
    }

    return this.prisma.plugin.update({
      where: { id },
      data: { isEnabled: false },
    });
  }

  async updateConfig(id: string, config: Record<string, unknown>) {
    const plugin = await this.findById(id);
    const instance = this.registry.get(plugin.name);
    const oldConfig = plugin.config as Record<string, unknown>;

    if (instance?.onConfigUpdate) {
      await instance.onConfigUpdate(oldConfig, config);
    }

    return this.prisma.plugin.update({
      where: { id },
      data: { config: config as object },
    });
  }
}
