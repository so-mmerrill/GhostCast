import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserPluginsService } from './user-plugins.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@ghostcast/database';

/**
 * Controller for user-scoped plugin management.
 * Unlike IntegrationsController (admin-only), this allows individual users
 * to enable/disable USER-scoped plugins for themselves.
 */
@Controller('user-plugins')
export class UserPluginsController {
  constructor(private readonly userPluginsService: UserPluginsService) {}

  /**
   * Get all USER-scoped plugins with their status for the current user
   */
  @Get()
  async getUserPlugins(@CurrentUser() user: User) {
    return this.userPluginsService.getUserPlugins(user.id);
  }

  /**
   * Check if a specific plugin is enabled for the current user
   */
  @Get(':catalogId/status')
  async getPluginStatus(
    @CurrentUser() user: User,
    @Param('catalogId') catalogId: string,
  ) {
    const isEnabled = await this.userPluginsService.isPluginEnabledForUser(
      user.id,
      catalogId,
    );
    return { catalogId, isEnabled };
  }

  /**
   * Enable a USER-scoped plugin for the current user
   */
  @Post(':catalogId/enable')
  @HttpCode(HttpStatus.OK)
  async enablePlugin(
    @CurrentUser() user: User,
    @Param('catalogId') catalogId: string,
  ) {
    return this.userPluginsService.enableForUser(user.id, catalogId);
  }

  /**
   * Disable a USER-scoped plugin for the current user
   */
  @Post(':catalogId/disable')
  @HttpCode(HttpStatus.OK)
  async disablePlugin(
    @CurrentUser() user: User,
    @Param('catalogId') catalogId: string,
  ) {
    return this.userPluginsService.disableForUser(user.id, catalogId);
  }

  /**
   * Update user-specific configuration for a plugin
   */
  @Put(':catalogId/config')
  async updateConfig(
    @CurrentUser() user: User,
    @Param('catalogId') catalogId: string,
    @Body() body: { config: Record<string, unknown> },
  ) {
    return this.userPluginsService.updateUserConfig(
      user.id,
      catalogId,
      body.config,
    );
  }
}
