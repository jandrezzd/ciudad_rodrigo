import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './DTOs/create-role.dto';
import { UpdateRoleDto } from './DTOs/update-role.dto';
import { UpdatePermissionsDto } from './DTOs/update-permissions.dto';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  /** Catálogo fijo de módulos — antes de :id para que Nest no lo confunda
   *  con un id. */
  @Get('modulos')
  findModulos() {
    return this.rolesService.findModulos();
  }

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(Number(id));
  }

  @RequirePermission('roles', 'create')
  @Post()
  create(@Body() body: CreateRoleDto) {
    return this.rolesService.create(body);
  }

  @RequirePermission('roles', 'edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.rolesService.update(Number(id), body);
  }

  @RequirePermission('roles', 'edit')
  @Patch(':id/permissions')
  updatePermissions(@Param('id') id: string, @Body() body: UpdatePermissionsDto) {
    return this.rolesService.updatePermissions(Number(id), body);
  }

  @RequirePermission('roles', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(Number(id));
  }
}
