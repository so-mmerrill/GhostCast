import { Module } from '@nestjs/common';
import { FormattersController } from './formatters.controller';
import { FormattersService } from './formatters.service';

@Module({
  controllers: [FormattersController],
  providers: [FormattersService],
  exports: [FormattersService],
})
export class FormattersModule {}
