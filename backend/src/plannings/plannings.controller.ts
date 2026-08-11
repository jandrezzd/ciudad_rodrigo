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
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { multerConfigInvoice } from './multer.config';

@Controller('plannings')
export class PlanningsController {
  constructor(private planningsService: PlanningsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'invoice', maxCount: 1 },
      ],
      multerConfigInvoice,
    ),
  )
  create(@Body() body: CreatePlanningDto, @UploadedFiles() files) {
    return this.planningsService.create(body, files);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.planningsService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planningsService.findOne(Number(id));
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'invoice', maxCount: 1 },
      ],
      multerConfigInvoice,
    ),
  )
  update(@Param('id') id: string, @Body() body: UpdatePlanningDto, @UploadedFiles() files) {
    return this.planningsService.update(Number(id), body, files);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.planningsService.remove(Number(id));
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':planningId/vehicles/:vehicleId')
  addVehicle(@Param('planningId') planningId: string, @Param('vehicleId') vehicleId: string) {
    return this.planningsService.addVehicle(Number(planningId), Number(vehicleId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':planningId/vehicles/:vehicleId')
  removeVehicle(
    @Param('planningId') planningId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.planningsService.removeVehicle(Number(planningId), Number(vehicleId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':planningId/vehicles')
  getVehiclesByPlanning(@Param('planningId') planningId: string) {
    return this.planningsService.getVehiclesByPlanning(Number(planningId));
  }
}
