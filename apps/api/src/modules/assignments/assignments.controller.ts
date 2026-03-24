import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@ghostcast/shared';
import { User } from '@ghostcast/database';
import { Audit } from '../../common/decorators/audit.decorator';

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  async findAll(@Query() pagination: PaginationDto) {
    return this.assignmentsService.findAll(pagination);
  }

  @Get('calendar')
  async getCalendarView(@Query() query: CalendarQueryDto) {
    return this.assignmentsService.getCalendarView(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.assignmentsService.findById(id);
  }

  @Post()
  @Roles(Role.SCHEDULER, Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'CREATE', entity: 'Assignment' })
  async create(
    @Body() createAssignmentDto: CreateAssignmentDto,
    @CurrentUser() user: User
  ) {
    return this.assignmentsService.create(createAssignmentDto, user.id);
  }

  @Put(':id')
  @Roles(Role.SCHEDULER, Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'Assignment' })
  async update(
    @Param('id') id: string,
    @Body() updateAssignmentDto: UpdateAssignmentDto
  ) {
    return this.assignmentsService.update(id, updateAssignmentDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SCHEDULER, Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'DELETE', entity: 'Assignment' })
  async remove(@Param('id') id: string) {
    await this.assignmentsService.remove(id);
  }
}
