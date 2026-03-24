import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SkipAudit } from '../../common/decorators/audit.decorator';

@Controller('health')
@Public()
@SkipAudit()
export class LivenessController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
