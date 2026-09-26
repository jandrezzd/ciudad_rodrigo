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
import { ClientsService } from './clients.service';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreateClientDto } from './DTOs/create-client.dto';
import { UpdateClientDto } from './DTOs/update-client.dto';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('clients')
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @RequirePermission('clients', 'create')
  @Post()
  create(@Body() createClientDto: CreateClientDto) {
    return this.clientsService.create(createClientDto);
  }

  @Get()
  findAll() {
    return this.clientsService.findAll();
  }

  @RequirePermission('clients', 'edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientsService.update(Number(id), updateClientDto);
  }

  @RequirePermission('clients', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(Number(id));
  }
}
