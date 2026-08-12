import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { TransportLogService } from './transport-log.service';
import { AuthGuard } from '@nestjs/passport';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { multerConfig } from './multer.config';
import { CreateDepartureDto } from './DTOs/create-departure.dto';
import { RegisterArrivalDto } from './DTOs/register-arrival.dto';
import { SubmitArrivalDto } from './DTOs/submit-arrival.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('transport')
export class TransportLogController {
  constructor(private service: TransportLogService) {}

  @Get('qr/scan')
  getByQrCode(@Query('qrcode') qrcode: string, @Req() req) {
    if (!qrcode) {
      throw new BadRequestException('qrcode es requerido');
    }
    return this.service.getByQrCode(qrcode, req.user.id);
  }

  @Post('departure')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'driver', maxCount: 1 },
        { name: 'vehicle', maxCount: 1 },
        { name: 'plate', maxCount: 1 },
        { name: 'material', maxCount: 2 },
      ],
      multerConfig,
    ),
  )
  createDeparture(
    @Req() req,
    @Body() body: CreateDepartureDto,
    @UploadedFiles() files,
  ) {
    return this.service.createDeparture(req.user.id, body, files);
  }

  @Post('arrival')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'driver', maxCount: 1 },
        { name: 'vehicle', maxCount: 1 },
        { name: 'plate', maxCount: 1 },
        { name: 'material', maxCount: 2 },
      ],
      multerConfig,
    ),
  )
  submitArrival(
    @Req() req,
    @Body() body: SubmitArrivalDto,
    @UploadedFiles() files,
  ) {
    return this.service.submitArrival(body, files, req.user.id);
  }

  @Patch(':id/arrival')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'driver', maxCount: 1 },
        { name: 'vehicle', maxCount: 1 },
        { name: 'plate', maxCount: 1 },
        { name: 'material', maxCount: 2 },
      ],
      multerConfig,
    ),
  )
  registerArrivalLegacy(
    @Req() req,
    @Param('id') id: string,
    @Body() body: RegisterArrivalDto,
    @UploadedFiles() files,
  ) {
    return this.service.registerArrivalLegacy(Number(id), body, files, req.user.id);
  }

  @Patch(':id/correct-material')
  correctMaterial(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { departureM3Corrected?: number; arrivalM3Corrected?: number },
  ) {
    return this.service.correctMaterial(Number(id), body, req.user.id);
  }

  @Get('user/:userId')
  getUserTransports(@Param('userId') userId: string) {
    return this.service.findAllByUserId(Number(userId));
  }

  @Get('user/:userId/filtered')
  getFilteredTransports(
    @Param('userId') userId: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.findAllByUserIdWithFilters(
      Number(userId),
      vehicleId ? Number(vehicleId) : undefined,
      startDate,
      endDate,
    );
  }

  @Get('user/:userId/vehicles')
  getUserVehicles(@Param('userId') userId: string) {
    return this.service.getUniqueVehiclesByUserId(Number(userId));
  }

  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Patch(':id/mark-alert')
  markAsAlert(@Param('id') id: string) {
    return this.service.markAsAlert(Number(id));
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.service.updateTransportStatus(Number(id), body.status);
  }
}