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
import { FormattersService } from './formatters.service';
import { CreateFormatterDto } from './dto/create-formatter.dto';
import { UpdateFormatterDto } from './dto/update-formatter.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@ghostcast/shared';
import { Audit } from '../../common/decorators/audit.decorator';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('formatters')
export class FormattersController {
  constructor(private readonly formattersService: FormattersService) {}

  @Get()
  async findAll(@Query() pagination: PaginationDto) {
    return this.formattersService.findAll(pagination);
  }

  @Get('active')
  async findActive() {
    return this.formattersService.findActive();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.formattersService.findById(id);
  }

  @Post()
  @Roles(Role.SCHEDULER, Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'CREATE', entity: 'Formatter' })
  async create(@Body() createFormatterDto: CreateFormatterDto) {
    return this.formattersService.create(createFormatterDto);
  }

  @Put(':id')
  @Roles(Role.SCHEDULER, Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'Formatter' })
  async update(
    @Param('id') id: string,
    @Body() updateFormatterDto: UpdateFormatterDto
  ) {
    return this.formattersService.update(id, updateFormatterDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SCHEDULER, Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'DELETE', entity: 'Formatter' })
  async remove(@Param('id') id: string) {
    await this.formattersService.remove(id);
  }
}
