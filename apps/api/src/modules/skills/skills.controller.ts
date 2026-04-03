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
import { SkillsService } from './skills.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@ghostcast/shared';
import { Audit } from '../../common/decorators/audit.decorator';

@Throttle({ short: {}, medium: {}, long: {} })
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  async findAll(@Query() pagination: PaginationDto) {
    return this.skillsService.findAll(pagination);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.skillsService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @Audit({ action: 'CREATE', entity: 'Skill' })
  async create(@Body() createSkillDto: CreateSkillDto) {
    return this.skillsService.create(createSkillDto);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @Audit({ action: 'UPDATE', entity: 'Skill' })
  async update(@Param('id') id: string, @Body() updateSkillDto: UpdateSkillDto) {
    return this.skillsService.update(id, updateSkillDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.ADMIN)
  @Audit({ action: 'DELETE', entity: 'Skill' })
  async remove(@Param('id') id: string) {
    await this.skillsService.remove(id);
  }
}
