import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@ghostcast/shared';
import { User } from '@ghostcast/database';
import { KantataMembersSyncService } from './kantata-members-sync.service';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('kantata/members')
export class KantataMembersController {
  constructor(
    private readonly syncService: KantataMembersSyncService,
  ) {}

  /**
   * Trigger a manual sync of members from Kantata
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit({ action: 'SYNC', entity: 'KantataMembersSync' })
  async triggerSync(@CurrentUser() user: User) {
    const result = await this.syncService.sync(user?.id);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Sync failed',
        errors: result.errors,
      });
    }

    return result;
  }

  /**
   * Get the sync status and test the connection
   */
  @Get('status')
  @Roles(Role.ADMIN, Role.MANAGER)
  async getStatus() {
    const connectionTest = await this.syncService.testConnection();

    return {
      configured: connectionTest.success,
      connectionTest,
    };
  }
}
