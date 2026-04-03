import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IntegrationsService } from './integrations.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@ghostcast/shared';
import { User } from '@ghostcast/database';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('integrations')
@Roles(Role.ADMIN)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('catalog')
  async getCatalog() {
    return this.integrationsService.getCatalogWithStatus();
  }

  @Get('installed')
  async getInstalled() {
    return this.integrationsService.getInstalled();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.integrationsService.getById(id);
  }

  @Post(':catalogId/install')
  @Audit({ action: 'INSTALL', entity: 'Integration' })
  async install(
    @Param('catalogId') catalogId: string,
    @Body() body: { config?: Record<string, unknown> }
  ) {
    return this.integrationsService.install(catalogId, body.config);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'UNINSTALL', entity: 'Integration' })
  async uninstall(@Param('id') id: string) {
    await this.integrationsService.uninstall(id);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ENABLE', entity: 'Integration' })
  async enable(@Param('id') id: string) {
    return this.integrationsService.enable(id);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'DISABLE', entity: 'Integration' })
  async disable(@Param('id') id: string) {
    return this.integrationsService.disable(id);
  }

  @Put(':id/config')
  @Audit({ action: 'UPDATE_CONFIG', entity: 'Integration' })
  async updateConfig(
    @Param('id') id: string,
    @Body() body: { config: Record<string, unknown> }
  ) {
    return this.integrationsService.updateConfig(id, body.config);
  }

  @Get(':id/health')
  async checkHealth(@Param('id') id: string) {
    return this.integrationsService.checkHealth(id);
  }

  @Post(':id/actions/:actionId')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EXECUTE_ACTION', entity: 'Integration' })
  async executeAction(
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @CurrentUser() user: User,
  ) {
    return this.integrationsService.executeAction(id, actionId, user?.id);
  }
}
