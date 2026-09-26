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
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { multerConfig } from './multer.config';
import { SubmitDepartureDto } from './DTOs/submit-departure.dto';
import { RegisterArrivalDto } from './DTOs/register-arrival.dto';
import { SubmitArrivalDto } from './DTOs/submit-arrival.dto';
import { ManualMatchDto } from './DTOs/manual-match.dto';
import { UnmatchTripDto } from './DTOs/unmatch-trip.dto';
import { CreatePendingArrivalDto } from './DTOs/create-pending-arrival.dto';
import { ReassignTripDto } from './DTOs/reassign-trip.dto';
import { UpdateMaterialDto } from './DTOs/update-material.dto';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('transport')
export class TransportLogController {
  constructor(private service: TransportLogService) {}

  @RequirePermission('transport-log', 'view')
  @Get('qr/scan')
  getByQrCode(@Query('qrcode') qrcode: string, @Req() req) {
    if (!qrcode) {
      throw new BadRequestException('qrcode es requerido');
    }
    return this.service.getByQrCode(qrcode, req.user.id);
  }

  @RequirePermission('transport-log', 'create')
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
    @Body() body: SubmitDepartureDto,
    @UploadedFiles() files,
  ) {
    return this.service.createDeparture(req.user.id, body, files);
  }

  @RequirePermission('transport-log', 'create')
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

  @RequirePermission('transport-log', 'edit')
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
    return this.service.registerArrivalLegacy(
      Number(id),
      body,
      files,
      req.user.id,
    );
  }

  @RequirePermission('transport-log', 'edit')
  @Patch(':id/correct-material')
  correctMaterial(
    @Req() req,
    @Param('id') id: string,
    @Body()
    body: {
      departureM3Corrected?: number;
      arrivalM3Corrected?: number;
      observation?: string;
    },
  ) {
    return this.service.correctMaterial(Number(id), body, req.user.id);
  }

  /** Corrige el material del viaje. Mueve también el consumo de la cantera. */
  @RequirePermission('transport-log', 'edit')
  @Patch(':id/material')
  updateMaterial(
    @Req() req,
    @Param('id') id: string,
    @Body() body: UpdateMaterialDto,
  ) {
    return this.service.updateMaterial(
      Number(id),
      body.materialId,
      req.user.id,
    );
  }

  @RequirePermission('transport-log', 'view')
  @Get('user/:userId')
  getUserTransports(@Param('userId') userId: string) {
    return this.service.findAllByUserId(Number(userId));
  }

  @RequirePermission('transport-log', 'view')
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

  @RequirePermission('transport-log', 'view')
  @Get('user/:userId/vehicles')
  getUserVehicles(@Param('userId') userId: string) {
    return this.service.getUniqueVehiclesByUserId(Number(userId));
  }

  @RequirePermission('transport-log', 'view')
  @Get('catalog')
  getCatalog() {
    return this.service.getCatalog();
  }

  // Cola de revisión de conciliación (plan 1.3). Van antes de ':id' para no
  // que la ruta comodín las intercepte como si fueran un id.
  @RequirePermission('transport-log', 'view')
  @Get('pending-arrivals')
  getPendingArrivals(@Req() req) {
    return this.service.getPendingArrivals(req.user.id);
  }

  @RequirePermission('transport-log', 'view')
  @Get('unmatched-departures')
  getUnmatchedDepartures(@Req() req) {
    return this.service.getUnmatchedDepartures(req.user.id);
  }

  @RequirePermission('transport-log', 'create')
  @Post('pending-arrival')
  createPendingArrival(@Req() req, @Body() body: CreatePendingArrivalDto) {
    return this.service.createPendingArrival(body, req.user.id);
  }

  @RequirePermission('transport-log', 'edit')
  @Post('manual-match')
  manualMatch(@Req() req, @Body() body: ManualMatchDto) {
    return this.service.manualMatch(
      body.tripId,
      body.pendingArrivalId,
      req.user.id,
    );
  }

  @RequirePermission('transport-log', 'view')
  @Get()
  findAll(@Req() req) {
    return this.service.findAll(req.user.id);
  }

  @RequirePermission('transport-log', 'view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @RequirePermission('transport-log', 'edit')
  @Patch(':id/mark-alert')
  markAsAlert(@Req() req, @Param('id') id: string) {
    return this.service.markAsAlert(Number(id), req.user.id);
  }

  @RequirePermission('transport-log', 'edit')
  @Patch(':id/status')
  updateStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.service.updateTransportStatus(
      Number(id),
      body.status,
      req.user.id,
    );
  }

  @RequirePermission('transport-log', 'edit')
  @Patch(':id/reassign')
  reassignTrip(
    @Req() req,
    @Param('id') id: string,
    @Body() body: ReassignTripDto,
  ) {
    return this.service.reassignTrip(Number(id), body, req.user.id);
  }

  @RequirePermission('transport-log', 'edit')
  @Post(':id/unmatch')
  unmatchTrip(
    @Req() req,
    @Param('id') id: string,
    @Body() body: UnmatchTripDto,
  ) {
    return this.service.unmatchTrip(Number(id), body.reason, req.user.id);
  }
}
