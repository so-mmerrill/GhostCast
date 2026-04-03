import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, IngestionJobStatus } from '@ghostcast/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { IngestionService } from './ingestion.service';
import { IngestionPayloadDto } from './dto/ingestion-payload.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface CurrentUserType {
  id: string;
  email: string;
  role: Role;
}

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('ingestion')
@Roles(Role.ADMIN, Role.MANAGER)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Execute a data ingestion
   */
  @Post()
  @Audit({ action: 'INGEST', entity: 'Ingestion' })
  async ingest(
    @Body() payload: IngestionPayloadDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    // Add triggered by user if not already set
    if (!payload.options.triggeredBy) {
      payload.options.triggeredBy = user.id;
    }
    return this.ingestionService.ingest(payload as any);
  }

  /**
   * Validate data without committing (dry-run)
   */
  @Post('validate')
  async validate(
    @Body() payload: IngestionPayloadDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    // Force dry-run mode
    const modifiedPayload = {
      ...payload,
      options: {
        ...payload.options,
        dryRun: true,
        triggeredBy: user.id,
      },
    };
    return this.ingestionService.ingest(modifiedPayload as any);
  }

  /**
   * List async ingestion jobs
   */
  @Get('jobs')
  async listJobs(
    @Query('status') status?: IngestionJobStatus,
    @Query('source') source?: string,
  ) {
    return this.ingestionService.listJobs({ status, source });
  }

  /**
   * Get a specific job status and result
   */
  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    return this.ingestionService.getJob(id);
  }

  /**
   * Get external ID mappings for a source
   */
  @Get('mappings')
  async getMappings(
    @Query('source') source: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.ingestionService.getMappings(source, entityType);
  }

  /**
   * Clear all mappings for a source
   */
  @Delete('mappings/:source')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'DELETE_MAPPINGS', entity: 'ExternalIdMapping' })
  async clearMappings(@Param('source') source: string) {
    await this.ingestionService.clearMappings(source);
  }
}
