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
import { ProjectTypesService } from './project-types.service';
import { CreateProjectTypeDto } from './dto/create-project-type.dto';
import { UpdateProjectTypeDto } from './dto/update-project-type.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@ghostcast/shared';
import { Audit } from '../../common/decorators/audit.decorator';

@Controller('project-types')
export class ProjectTypesController {
  constructor(private readonly projectTypesService: ProjectTypesService) {}

  @Get()
  async findAll(@Query() pagination: PaginationDto) {
    return this.projectTypesService.findAll(pagination);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectTypesService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @Audit({ action: 'CREATE', entity: 'ProjectType' })
  async create(@Body() createProjectTypeDto: CreateProjectTypeDto) {
    return this.projectTypesService.create(createProjectTypeDto);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'ProjectType' })
  async update(
    @Param('id') id: string,
    @Body() updateProjectTypeDto: UpdateProjectTypeDto
  ) {
    return this.projectTypesService.update(id, updateProjectTypeDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.ADMIN)
  @Audit({ action: 'DELETE', entity: 'ProjectType' })
  async remove(@Param('id') id: string) {
    await this.projectTypesService.remove(id);
  }
}
