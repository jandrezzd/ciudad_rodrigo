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
import { CreateOwnerDto } from './DTOs/create-owner.dto';
import { UpdateOwnerDto } from './DTOs/update-owner.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('owners')
export class OwnersController {
  constructor(private ownersService: OwnersService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() body: CreateOwnerDto) {
    return this.ownersService.create(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.ownersService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateOwnerDto) {
    return this.ownersService.update(Number(id), body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ownersService.remove(Number(id));
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('internal')
  findInternal() {
    return this.ownersService.findInternal();
  }
}