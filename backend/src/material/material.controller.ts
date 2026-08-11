import { Controller, Get, UseGuards } from '@nestjs/common';
import { MaterialService } from './material.service';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('material')
export class MaterialController {
  constructor(private service: MaterialService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
