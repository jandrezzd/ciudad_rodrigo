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
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CreateVehicleDto } from './DTOs/create-vehicle.dto';
import { UpdateVehicleDto } from './DTOs/update-vehicle.dto';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @RequirePermission('vehicles', 'create')
  @Post()
  create(@Body() body: CreateVehicleDto) {
    return this.vehiclesService.create(body);
  }

  @Get()
  findAll() {
    return this.vehiclesService.findAll();
  }

  @RequirePermission('vehicles', 'edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateVehicleDto) {
    return this.vehiclesService.update(Number(id), body);
  }

  @RequirePermission('vehicles', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(Number(id));
  }

  @RequirePermission('vehicles', 'create')
  @Post('generate-batch')
  generateBatch(
    @Body() body: { internalCount?: number; externalCount?: number },
  ) {
    return this.vehiclesService.generateBatch(
      body.internalCount || 0,
      body.externalCount || 0,
    );
  }

  @Get('qrcodes/available')
  getAvailableQRCodes() {
    return this.vehiclesService.getAvailableQRCodes();
  }

  @Get('qrcode/:vehicleId')
  getQRCodeByVehicleId(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.getQRCodeByVehicleId(Number(vehicleId));
  }

  @RequirePermission('vehicles', 'edit')
  @Post(':vehicleId/generate-new-qr')
  generateNewQRForVehicle(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.generateNewQRForVehicle(Number(vehicleId));
  }

  @RequirePermission('vehicles', 'edit')
  @Patch(':vehicleId/detach-qr')
  detachQRCode(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.detachQRCode(Number(vehicleId));
  }
}
