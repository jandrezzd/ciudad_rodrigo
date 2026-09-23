import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreateUserDto } from './DTOs/create-user.dto';
import { UpdateUserDto } from './DTOs/update-user.dto';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @RequirePermission('users', 'create')
  @Post()
  create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @RequirePermission('users', 'edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.update(Number(id), body);
  }

  @RequirePermission('users', 'toggle')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.deactivate(Number(id));
  }
}
