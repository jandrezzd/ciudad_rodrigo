import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { OwnersService } from './owners.service';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreateOwnerDto } from './DTOs/create-owner.dto';
import { UpdateOwnerDto } from './DTOs/update-owner.dto';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('owners')
export class OwnersController {
  constructor(private ownersService: OwnersService) {}

  @RequirePermission('owners', 'create')
  @Post()
  create(@Body() body: CreateOwnerDto) {
    return this.ownersService.create(body);
  }

  @Get()
  findAll() {
    return this.ownersService.findAll();
  }

  @RequirePermission('owners', 'edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateOwnerDto) {
    return this.ownersService.update(Number(id), body);
  }

  @RequirePermission('owners', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ownersService.remove(Number(id));
  }

  @Get('internal')
  findInternal() {
    return this.ownersService.findInternal();
  }
}
