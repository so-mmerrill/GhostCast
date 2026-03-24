import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { CatalogService } from './catalog.service';
import { UserPluginsController } from './user-plugins.controller';
import { UserPluginsService } from './user-plugins.service';
import { PluginsModule } from '../../plugins/plugins.module';

@Module({
  imports: [PluginsModule],
  controllers: [IntegrationsController, UserPluginsController],
  providers: [IntegrationsService, CatalogService, UserPluginsService],
  exports: [IntegrationsService, CatalogService, UserPluginsService],
})
export class IntegrationsModule {}
