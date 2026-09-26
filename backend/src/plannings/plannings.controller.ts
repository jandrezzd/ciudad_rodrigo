import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
} from '@nestjs/common';
import { PlanningsService } from './plannings.service';
import { CreatePlanningDto } from './DTOs/create-planning.dto';
import { UpdatePlanningDto } from './DTOs/update-planning.dto';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { multerConfigInvoice } from './multer.config';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('plannings')
export class PlanningsController {
  constructor(private planningsService: PlanningsService) {}

  @RequirePermission('plannings', 'create')
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'invoice', maxCount: 1 }],
      multerConfigInvoice,
    ),
  )
  create(@Body() body: CreatePlanningDto, @UploadedFiles() files) {
    return this.planningsService.create(body, files);
  }

  @Get()
  findAll() {
    return this.planningsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planningsService.findOne(Number(id));
  }

  @RequirePermission('plannings', 'edit')
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'invoice', maxCount: 1 }],
      multerConfigInvoice,
    ),
  )
  update(
    @Param('id') id: string,
    @Body() body: UpdatePlanningDto,
    @UploadedFiles() files,
  ) {
    return this.planningsService.update(Number(id), body, files);
  }

  @RequirePermission('plannings', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.planningsService.remove(Number(id));
  }

  @RequirePermission('plannings', 'edit')
  @Post(':planningId/vehicles/:vehicleId')
  addVehicle(
    @Param('planningId') planningId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body?: { canteraId?: number | null },
  ) {
    return this.planningsService.addVehicle(
      Number(planningId),
      Number(vehicleId),
      body?.canteraId != null ? Number(body.canteraId) : body?.canteraId,
    );
  }

  @RequirePermission('plannings', 'edit')
  @Patch(':planningId/vehicles/:vehicleId/cantera')
  setVehicleCantera(
    @Param('planningId') planningId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { canteraId: number | null },
  ) {
    return this.planningsService.setVehicleCantera(
      Number(planningId),
      Number(vehicleId),
      body?.canteraId != null ? Number(body.canteraId) : null,
    );
  }

  @RequirePermission('plannings', 'edit')
  @Delete(':planningId/vehicles/:vehicleId')
  removeVehicle(
    @Param('planningId') planningId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.planningsService.removeVehicle(
      Number(planningId),
      Number(vehicleId),
    );
  }

  @Get(':planningId/vehicles')
  getVehiclesByPlanning(@Param('planningId') planningId: string) {
    return this.planningsService.getVehiclesByPlanning(Number(planningId));
  }

  /** Consumo de material de la planificación, por cantera y material */
  @Get(':planningId/consumo-material')
  getConsumoMaterial(@Param('planningId') planningId: string) {
    return this.planningsService.getConsumoMaterial(Number(planningId));
  }
}
