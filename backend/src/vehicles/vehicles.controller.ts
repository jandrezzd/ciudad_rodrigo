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
import { VehiclesService } from './vehicles.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateVehicleDto } from './DTOs/create-vehicle.dto';
import { UpdateVehicleDto } from './DTOs/update-vehicle.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('vehicles')
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() body: CreateVehicleDto) {
    return this.vehiclesService.create(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.vehiclesService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateVehicleDto) {
    return this.vehiclesService.update(Number(id), body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(Number(id));
  }

  @Post('generate-batch')
  generateBatch(
    @Body() body: { internalCount?: number; externalCount?: number },
  ) {
    return this.vehiclesService.generateBatch(
      body.internalCount || 0,
      body.externalCount || 0,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('qrcodes/available')
  getAvailableQRCodes() {
    return this.vehiclesService.getAvailableQRCodes();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('qrcode/:vehicleId')
  getQRCodeByVehicleId(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.getQRCodeByVehicleId(Number(vehicleId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':vehicleId/generate-new-qr')
  generateNewQRForVehicle(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.generateNewQRForVehicle(Number(vehicleId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':vehicleId/detach-qr')
  detachQRCode(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.detachQRCode(Number(vehicleId));
  }
}