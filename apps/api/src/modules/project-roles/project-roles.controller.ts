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
import { ProjectRolesService } from './project-roles.service';
import { CreateProjectRoleDto } from './dto/create-project-role.dto';
import { UpdateProjectRoleDto } from './dto/update-project-role.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@ghostcast/shared';
import { Audit } from '../../common/decorators/audit.decorator';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('project-roles')
export class ProjectRolesController {
  constructor(private readonly projectRolesService: ProjectRolesService) {}

  @Get()
  async findAll(@Query() pagination: PaginationDto) {
    return this.projectRolesService.findAll(pagination);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectRolesService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @Audit({ action: 'CREATE', entity: 'ProjectRole' })
  async create(@Body() createProjectRoleDto: CreateProjectRoleDto) {
    return this.projectRolesService.create(createProjectRoleDto);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'ProjectRole' })
  async update(@Param('id') id: string, @Body() updateProjectRoleDto: UpdateProjectRoleDto) {
    return this.projectRolesService.update(id, updateProjectRoleDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.ADMIN)
  @Audit({ action: 'DELETE', entity: 'ProjectRole' })
  async remove(@Param('id') id: string) {
    await this.projectRolesService.remove(id);
  }
}
