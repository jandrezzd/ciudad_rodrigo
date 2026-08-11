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
import { CreateClientDto } from './DTOs/create-client.dto';
import { UpdateClientDto } from './DTOs/update-client.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('clients')
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() createClientDto: CreateClientDto) {
        return this.clientsService.create(createClientDto);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll() {
        return this.clientsService.findAll();
    }

    @UseGuards(AuthGuard('jwt'))
    @Patch(':id')
    update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
        return this.clientsService.update(Number(id), updateClientDto);
    }

    @UseGuards(AuthGuard('jwt'))
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.clientsService.remove(Number(id));
    }
}
