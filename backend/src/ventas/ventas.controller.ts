import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { VentasService } from './ventas.service';
import { VentasQrService } from './ventas-qr.service';
import { multerConfigVenta } from './multer.config';
import { CreateVentaDto } from './DTOs/create-venta.dto';
import { UpdateVentaDto } from './DTOs/update-venta.dto';
import { QueryVentasDto } from './DTOs/query-ventas.dto';
import { GenerateVentaQrDto } from './DTOs/generate-venta-qr.dto';
import { VentasStockService } from './ventas-stock.service';
import { AjusteStockDto, IngresoStockDto } from './DTOs/venta-stock.dto';
import { VentasOrdenesService } from './ventas-ordenes.service';
import {
  CerrarVentaOrdenDto,
  CreateVentaOrdenDto,
  QueryVentaOrdenesDto,
  UpdateVentaOrdenDto,
} from './DTOs/venta-orden.dto';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly ventasQrService: VentasQrService,
    private readonly ventasStockService: VentasStockService,
    private readonly ventasOrdenesService: VentasOrdenesService,
  ) {}

  // ─── Órdenes ────────────────────────────────────────────────────────────────
  // También antes de @Get(':id') de venta, y 'abiertas' antes de ':id' de
  // orden, por el mismo motivo que el resto de los bloques de este controller.
  // Todo bajo el módulo 'ventas-ordenes'.

  /** Catálogo que consume la app, y también el selector de Material del modal
   *  "Editar venta" en la web (módulo 'ventas', no 'ventas-ordenes') — por eso
   *  solo pide sesión iniciada, igual que el resto de las listas de referencia
   *  cruzadas entre módulos. */
  @Get('ordenes/abiertas')
  getOrdenesAbiertas() {
    return this.ventasOrdenesService.getAbiertas();
  }

  @RequirePermission('ventas-ordenes', 'view')
  @Get('ordenes')
  findAllOrdenes(@Query() query: QueryVentaOrdenesDto) {
    return this.ventasOrdenesService.findAll(query);
  }

  @RequirePermission('ventas-ordenes', 'create')
  @Post('ordenes')
  createOrden(@Body() body: CreateVentaOrdenDto) {
    return this.ventasOrdenesService.create(body);
  }

  @RequirePermission('ventas-ordenes', 'view')
  @Get('ordenes/:id')
  findOneOrden(@Param('id') id: string) {
    return this.ventasOrdenesService.findOne(Number(id));
  }

  @RequirePermission('ventas-ordenes', 'edit')
  @Patch('ordenes/:id')
  updateOrden(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateVentaOrdenDto,
  ) {
    return this.ventasOrdenesService.update(Number(id), body, req.user.id);
  }

  /** Botón "Enviar a Telegram" de la edición: reenvía el estado actual de la
   *  orden a los supervisores de cantera. Manual — crear la orden ya avisa
   *  solo, esto es para cuando se le cambian los m³ después. */
  @RequirePermission('ventas-ordenes', 'edit')
  @Post('ordenes/:id/notificar')
  notificarOrden(@Param('id') id: string) {
    return this.ventasOrdenesService.notificarModificacion(Number(id));
  }

  /** Cierre manual, con motivo obligatorio. */
  @RequirePermission('ventas-ordenes', 'edit')
  @Post('ordenes/:id/cerrar')
  cerrarOrden(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CerrarVentaOrdenDto,
  ) {
    return this.ventasOrdenesService.cerrar(
      Number(id),
      req.user.id,
      body.motivo,
    );
  }

  /** Baja lógica. Rechaza si la orden ya tiene despachos. */
  @RequirePermission('ventas-ordenes', 'delete')
  @Delete('ordenes/:id')
  removeOrden(@Param('id') id: string) {
    return this.ventasOrdenesService.remove(Number(id));
  }

  // ─── Stock ──────────────────────────────────────────────────────────────────
  // También antes de @Get(':id'), por el mismo motivo que el bloque de QR.
  // Todo bajo el módulo 'ventas' (stock de cantera, no de la orden).

  @RequirePermission('ventas', 'view')
  @Get('stock')
  getStock(@Query('canteraId') canteraId?: string) {
    return this.ventasStockService.getStockGeneral(
      canteraId ? Number(canteraId) : undefined,
    );
  }

  @RequirePermission('ventas', 'view')
  @Get('stock/cantera/:canteraId')
  getStockCantera(@Param('canteraId') canteraId: string) {
    return this.ventasStockService.getStockByCantera(Number(canteraId));
  }

  @RequirePermission('ventas', 'view')
  @Get('stock/cantera/:canteraId/movimientos')
  getMovimientosStock(@Param('canteraId') canteraId: string) {
    return this.ventasStockService.getMovimientosByCantera(Number(canteraId));
  }

  /** Llega material a la cantera: suma a lo asignado y deja su movimiento. */
  @RequirePermission('ventas', 'edit')
  @Post('stock/ingreso')
  registrarIngreso(@Req() req: any, @Body() body: IngresoStockDto) {
    return this.ventasStockService.registrarIngreso(req.user.id, body);
  }

  /** Corrección manual del asignado, con motivo obligatorio. */
  @RequirePermission('ventas', 'edit')
  @Patch('stock/:stockId')
  ajustarStock(
    @Req() req: any,
    @Param('stockId') stockId: string,
    @Body() body: AjusteStockDto,
  ) {
    return this.ventasStockService.ajustarAsignado(
      req.user.id,
      Number(stockId),
      body.m3Asignados,
      body.motivo,
    );
  }

  /**
   * Borra un movimiento manual y deshace su efecto en el asignado. Va antes de
   * `stock/:stockId` o Nest tomaría "movimientos" como un id.
   */
  @RequirePermission('ventas', 'delete')
  @Delete('stock/movimientos/:movimientoId')
  eliminarMovimientoStock(@Param('movimientoId') movimientoId: string) {
    return this.ventasStockService.eliminarMovimiento(Number(movimientoId));
  }

  /** Retira el material del punto de venta. Baja lógica: el histórico se conserva. */
  @RequirePermission('ventas', 'delete')
  @Delete('stock/:stockId')
  retirarStock(@Param('stockId') stockId: string) {
    return this.ventasStockService.retirarMaterial(Number(stockId));
  }

  // ─── QR y catálogo ──────────────────────────────────────────────────────────
  // Van antes de @Get(':id') o Nest interpretaría "qr" y "catalog" como un id.

  @RequirePermission('ventas', 'view')
  @Get('qr')
  findAllQr() {
    return this.ventasQrService.findAll();
  }

  @RequirePermission('ventas', 'view')
  @Get('qr/scan')
  scanQr(@Query('qrcode') qrcode: string) {
    return this.ventasQrService.scan(qrcode);
  }

  @RequirePermission('ventas', 'edit')
  @Post('qr/generate')
  generateQr(@Body() body: GenerateVentaQrDto) {
    return this.ventasQrService.generar(body.canteraIds);
  }

  @RequirePermission('ventas', 'edit')
  @Patch('qr/:canteraId/deactivate')
  deactivateQr(@Param('canteraId') canteraId: string) {
    return this.ventasQrService.desactivar(Number(canteraId));
  }

  @RequirePermission('ventas', 'view')
  @Get('catalog')
  catalog() {
    return this.ventasQrService.catalog();
  }

  // ─── Consultas ──────────────────────────────────────────────────────────────

  @RequirePermission('ventas', 'view')
  @Get('vehiculo/:vehicleid')
  findVehiculo(@Param('vehicleid') vehicleid: string) {
    return this.ventasService.findVehiculo(vehicleid);
  }

  @RequirePermission('ventas', 'view')
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.ventasService.findByUser(Number(userId));
  }

  @RequirePermission('ventas', 'view')
  @Get('reportes/consumo')
  reporteConsumo(@Query() query: QueryVentasDto) {
    return this.ventasService.reporteConsumo(query);
  }

  @RequirePermission('ventas', 'view')
  @Get()
  findAll(@Query() query: QueryVentasDto) {
    return this.ventasService.findAll(query);
  }

  @RequirePermission('ventas', 'view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ventasService.findOne(Number(id));
  }

  // ─── Registro y corrección ──────────────────────────────────────────────────

  @RequirePermission('ventas', 'create')
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'plate', maxCount: 1 },
        { name: 'material', maxCount: 1 },
        { name: 'driver', maxCount: 1 },
        { name: 'vehicle', maxCount: 1 },
      ],
      multerConfigVenta,
    ),
  )
  create(@Req() req, @Body() body: CreateVentaDto, @UploadedFiles() files) {
    return this.ventasService.create(req.user.id, body, files);
  }

  @RequirePermission('ventas', 'edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateVentaDto) {
    return this.ventasService.update(Number(id), body);
  }

  /** Eliminación lógica: la fila queda, deja de listarse. */
  @RequirePermission('ventas', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ventasService.remove(Number(id));
  }
}
