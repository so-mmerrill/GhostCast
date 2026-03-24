import { Module } from '@nestjs/common';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';
import { EncryptionService } from '../../common/services/encryption.service';

@Module({
  controllers: [UserSettingsController],
  providers: [UserSettingsService, EncryptionService],
  exports: [UserSettingsService],
})
export class UserSettingsModule {}
