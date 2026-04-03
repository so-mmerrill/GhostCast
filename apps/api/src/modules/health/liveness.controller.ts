import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { SkipAudit } from '../../common/decorators/audit.decorator';

@SkipThrottle()
@Controller('health')
@Public()
@SkipAudit()
export class LivenessController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
