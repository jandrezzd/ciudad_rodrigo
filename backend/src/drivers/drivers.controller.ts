import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './DTOs/create-driver.dto';
import { UpdateDriverDto } from './DTOs/update-driver.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  findAll() {
    return this.driversService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(Number(id));
  }

  @Post()
  create(@Req() req, @Body() body: CreateDriverDto) {
    return this.driversService.create(req.user.id, body);
  }

  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() body: UpdateDriverDto) {
    return this.driversService.update(req.user.id, Number(id), body);
  }

  @Patch(':id/deactivate')
  deactivate(@Req() req, @Param('id') id: string) {
    return this.driversService.deactivate(req.user.id, Number(id));
  }
}
