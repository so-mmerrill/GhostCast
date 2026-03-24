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
import { PluginsService } from './plugins.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@ghostcast/shared';
import { Audit } from '../common/decorators/audit.decorator';
import { IsObject } from 'class-validator';

class UpdatePluginConfigDto {
  @IsObject()
  config!: Record<string, unknown>;
}

@Controller('admin/plugins')
@Roles(Role.ADMIN)
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Get()
  async findAll(): Promise<unknown[]> {
    return this.pluginsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<unknown> {
    return this.pluginsService.findById(id);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ENABLE', entity: 'Plugin' })
  async enable(@Param('id') id: string): Promise<unknown> {
    return this.pluginsService.enable(id);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'DISABLE', entity: 'Plugin' })
  async disable(@Param('id') id: string): Promise<unknown> {
    return this.pluginsService.disable(id);
  }

  @Put(':id/config')
  @Audit({ action: 'UPDATE_CONFIG', entity: 'Plugin' })
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdatePluginConfigDto
  ): Promise<unknown> {
    return this.pluginsService.updateConfig(id, dto.config);
  }
}
