import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { LiquidacionesService } from './liquidaciones.service';
import { ListarViajesLiquidablesDto } from './dto/listar-viajes-liquidables.dto';
import { CrearLiquidacionDto } from './dto/crear-liquidacion.dto';
import { EditarLiquidacionDto } from './dto/editar-liquidacion.dto';
import { ListarLiquidacionesDto } from './dto/listar-liquidaciones.dto';
import { AnularLiquidacionDto } from './dto/anular-liquidacion.dto';
import { NotaLiquidadorDto } from './dto/nota-liquidador.dto';

/**
 * Liquidaciones de viajes e historial de liquidaciones.
 * Ver docs/liquidaciones/README-liquidaciones-backend.md.
 *
 * Las rutas `viajes` van antes de `:id` para que "viajes" no se tome como id.
 */
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('liquidaciones')
export class LiquidacionesController {
  constructor(private service: LiquidacionesService) {}

  @RequirePermission('liquidaciones', 'view')
  @Get('viajes')
  listarViajes(@Query() filtros: ListarViajesLiquidablesDto) {
    return this.service.listarViajes(filtros);
  }

  @RequirePermission('liquidaciones', 'view')
  @Get('viajes/:id')
  obtenerViaje(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtenerViaje(id);
  }

  /** Nota del liquidador de un viaje (liquidado o no). */
  @RequirePermission('liquidaciones', 'edit')
  @Patch('viajes/:id/nota')
  guardarNotaViaje(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: NotaLiquidadorDto,
    @Req() req,
  ) {
    return this.service.guardarNotaViaje(id, body.nota, req.user.id);
  }

  @RequirePermission('liquidaciones', 'create')
  @Post()
  crear(@Body() body: CrearLiquidacionDto, @Req() req) {
    return this.service.crear(body, req.user.id);
  }

  @RequirePermission('liquidaciones', 'view')
  @Get()
  listar(@Query() filtros: ListarLiquidacionesDto) {
    return this.service.listar(filtros);
  }

  @RequirePermission('liquidaciones', 'view')
  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.service.detalle(id);
  }

  @RequirePermission('liquidaciones', 'edit')
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EditarLiquidacionDto,
    @Req() req,
  ) {
    return this.service.editar(id, body, req.user.id);
  }

  /**
   * Anular usa el permiso "Eliminar" del módulo: por defecto solo ADMIN
   * (se puede dar a otro rol desde Roles y permisos).
   */
  @RequirePermission('liquidaciones', 'delete')
  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AnularLiquidacionDto,
    @Req() req,
  ) {
    return this.service.anular(id, body.motivo, req.user.id);
  }
}
