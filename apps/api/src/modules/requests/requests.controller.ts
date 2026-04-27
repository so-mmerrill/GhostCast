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
import { Throttle } from '@nestjs/throttler';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { QueryRequestDto } from './dto/query-request.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@ghostcast/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface UserPayload {
  id: string;
  email: string;
  role: Role;
}

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  @Roles(Role.MEMBER)
  async findAll(
    @Query() query: QueryRequestDto,
    @CurrentUser() user: UserPayload
  ) {
    return this.requestsService.findAll(query, user.role);
  }

  @Get(':id')
  @Roles(Role.MEMBER)
  async findOne(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.requestsService.findById(id, user.role);
  }

  @Post()
  @Roles(Role.REQUESTER)
  @Audit({ action: 'CREATE', entity: 'Request' })
  async create(
    @Body() createRequestDto: CreateRequestDto,
    @CurrentUser() user: UserPayload
  ) {
    return this.requestsService.create(createRequestDto, user.id);
  }

  @Put(':id')
  @Roles(Role.REQUESTER)
  @Audit({ action: 'UPDATE', entity: 'Request' })
  async update(
    @Param('id') id: string,
    @Body() updateRequestDto: UpdateRequestDto
  ) {
    return this.requestsService.update(id, updateRequestDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SCHEDULER)
  @Audit({ action: 'DELETE', entity: 'Request' })
  async remove(@Param('id') id: string) {
    await this.requestsService.remove(id);
  }

  @Delete(':id/assignments')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SCHEDULER)
  @Audit({ action: 'DELETE', entity: 'Request', skip: true })
  async removeAssignments(@Param('id') id: string) {
    await this.requestsService.removeAssignments(id);
  }
}
