import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { MembersModule } from '../members/members.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [MembersModule, RealtimeModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
