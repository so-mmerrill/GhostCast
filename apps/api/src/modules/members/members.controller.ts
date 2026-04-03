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
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Role } from '@ghostcast/shared';
import { Audit } from '../../common/decorators/audit.decorator';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @Permissions({ resource: 'members', action: 'read' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.membersService.findAll(pagination);
  }

  @Get(':id')
  @Permissions({ resource: 'members', action: 'read' })
  async findOne(@Param('id') id: string) {
    return this.membersService.findById(id);
  }

  @Post()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'CREATE', entity: 'Member' })
  async create(@Body() createMemberDto: CreateMemberDto) {
    return this.membersService.create(createMemberDto);
  }

  @Put(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'Member' })
  async update(
    @Param('id') id: string,
    @Body() updateMemberDto: UpdateMemberDto
  ) {
    return this.membersService.update(id, updateMemberDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'DELETE', entity: 'Member' })
  async remove(@Param('id') id: string) {
    await this.membersService.remove(id);
  }

  @Get(':id/skills')
  @Permissions({ resource: 'members', action: 'read' })
  async getSkills(@Param('id') id: string) {
    return this.membersService.getMemberSkills(id);
  }

  @Post(':id/skills')
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'MemberSkill' })
  async addSkill(
    @Param('id') id: string,
    @Body() body: { skillId: string; level?: number }
  ) {
    return this.membersService.updateMemberSkillLevel(id, body.skillId, body.level ?? 1);
  }

  @Put(':id/skills/:skillId')
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'MemberSkill' })
  async updateSkillLevel(
    @Param('id') id: string,
    @Param('skillId') skillId: string,
    @Body() body: { level: number }
  ) {
    return this.membersService.updateMemberSkillLevel(id, skillId, body.level);
  }

  @Delete(':id/skills/:skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'DELETE', entity: 'MemberSkill' })
  async removeSkill(
    @Param('id') id: string,
    @Param('skillId') skillId: string
  ) {
    await this.membersService.removeMemberSkill(id, skillId);
  }

  @Get(':id/project-roles')
  @Permissions({ resource: 'members', action: 'read' })
  async getProjectRoles(@Param('id') id: string) {
    return this.membersService.getMemberProjectRoles(id);
  }

  @Post(':id/project-roles')
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'CREATE', entity: 'MemberProjectRole' })
  async addProjectRole(
    @Param('id') id: string,
    @Body() body: { projectRoleId: string; dateAwarded?: string }
  ) {
    return this.membersService.addMemberProjectRole(
      id,
      body.projectRoleId,
      body.dateAwarded ? new Date(body.dateAwarded) : undefined
    );
  }

  @Delete(':id/project-roles/:projectRoleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.MANAGER, Role.ADMIN)
  @Audit({ action: 'DELETE', entity: 'MemberProjectRole' })
  async removeProjectRole(
    @Param('id') id: string,
    @Param('projectRoleId') projectRoleId: string
  ) {
    await this.membersService.removeMemberProjectRole(id, projectRoleId);
  }

  @Get(':id/unavailability')
  @Permissions({ resource: 'members', action: 'read' })
  async getUnavailability(@Param('id') id: string) {
    return this.membersService.getMemberUnavailability(id);
  }

  @Get(':id/stats')
  @Permissions({ resource: 'members', action: 'read' })
  async getStats(@Param('id') id: string) {
    return this.membersService.getMemberAssignmentStats(id);
  }
}
