import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserSettingsService } from './user-settings.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@ghostcast/database';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('user-settings')
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get(':integrationId')
  async getSettings(
    @CurrentUser() user: User,
    @Param('integrationId') integrationId: string,
  ) {
    const settings = await this.userSettingsService.getAllSettings(
      user.id,
      integrationId,
    );
    // Mask sensitive values in response
    const masked = { ...settings };
    if (masked.apiKey) masked.apiKey = '***configured***';
    if (masked.API_KEY) masked.API_KEY = '***configured***';
    if (masked.secret) masked.secret = '***configured***';
    if (masked.password) masked.password = '***configured***';
    if (masked.token) masked.token = '***configured***';
    return { data: masked };
  }

  @Put(':integrationId')
  async updateSettings(
    @CurrentUser() user: User,
    @Param('integrationId') integrationId: string,
    @Body() body: { settings: Record<string, string> },
  ) {
    await this.userSettingsService.setMultipleSettings(
      user.id,
      integrationId,
      body.settings,
    );
    return { success: true };
  }

  @Delete(':integrationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSettings(
    @CurrentUser() user: User,
    @Param('integrationId') integrationId: string,
  ) {
    await this.userSettingsService.deleteAllSettings(user.id, integrationId);
  }

  @Get(':integrationId/configured')
  async isConfigured(
    @CurrentUser() user: User,
    @Param('integrationId') integrationId: string,
  ) {
    const hasConfig = await this.userSettingsService.hasConfiguration(
      user.id,
      integrationId,
    );
    return { data: { configured: hasConfig } };
  }
}
