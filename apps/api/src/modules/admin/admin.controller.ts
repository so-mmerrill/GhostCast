import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@ghostcast/shared';
import { Audit } from '../../common/decorators/audit.decorator';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('config')
  async getAllConfig(@Query('category') category?: string) {
    return this.adminService.getAllConfig(category);
  }

  @Get('config/:key')
  async getConfig(@Param('key') key: string) {
    return this.adminService.getConfig(key);
  }

  @Put('config/:key')
  @Audit({ action: 'UPDATE', entity: 'SystemConfig' })
  async updateConfig(
    @Param('key') key: string,
    @Body() updateConfigDto: UpdateConfigDto
  ) {
    return this.adminService.updateConfig(key, updateConfigDto.value);
  }

  @Get('dashboard')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }
}
