import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MaterialProvidersService } from './material-providers.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateMaterialProviderDto } from './DTOs/create-material-provider.dto';
import { UpdateMaterialProviderDto } from './DTOs/update-material-provider.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('material-providers')
export class MaterialProvidersController {
  constructor(private materialProvidersService: MaterialProvidersService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() body: CreateMaterialProviderDto) {
    return this.materialProvidersService.create(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.materialProvidersService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('canteras/:canteraId/saldos')
  getSaldos(@Param('canteraId') canteraId: string) {
    return this.materialProvidersService.getSaldosByCantera(Number(canteraId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('canteras/:canteraId/movimientos')
  getMovimientos(@Param('canteraId') canteraId: string) {
    return this.materialProvidersService.getMovimientosByCantera(Number(canteraId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/saldos')
  getSaldosProveedor(@Param('id') id: string) {
    return this.materialProvidersService.getSaldosByProveedor(Number(id));
  }

  /** Historial de despachos del proveedor con vehículos, conductores y planificaciones */
  @UseGuards(AuthGuard('jwt'))
  @Get(':id/historial')
  getHistorial(
    @Param('id') id: string,
    @Query('canteraId') canteraId?: string,
    @Query('planningId') planningId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.materialProvidersService.getHistorialByProveedor(Number(id), {
      canteraId: canteraId ? Number(canteraId) : undefined,
      planningId: planningId ? Number(planningId) : undefined,
      desde,
      hasta,
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.materialProvidersService.findOne(Number(id));
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateMaterialProviderDto) {
    return this.materialProvidersService.update(Number(id), body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.materialProvidersService.remove(Number(id));
  }
}
