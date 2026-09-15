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
import { VentasService } from './ventas.service';
import { VentasQrService } from './ventas-qr.service';
import { multerConfigVenta } from './multer.config';
import { CreateVentaDto } from './DTOs/create-venta.dto';
import { UpdateVentaDto } from './DTOs/update-venta.dto';
import { QueryVentasDto } from './DTOs/query-ventas.dto';
import { GenerateVentaQrDto } from './DTOs/generate-venta-qr.dto';
import { VentasStockService } from './ventas-stock.service';
import { AjusteStockDto, IngresoStockDto } from './DTOs/venta-stock.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly ventasQrService: VentasQrService,
    private readonly ventasStockService: VentasStockService,
  ) {}

  // ─── Stock ──────────────────────────────────────────────────────────────────
  // También antes de @Get(':id'), por el mismo motivo que el bloque de QR.

  @Get('stock')
  getStock(@Query('canteraId') canteraId?: string) {
    return this.ventasStockService.getStockGeneral(
      canteraId ? Number(canteraId) : undefined,
    );
  }

  @Get('stock/cantera/:canteraId')
  getStockCantera(@Param('canteraId') canteraId: string) {
    return this.ventasStockService.getStockByCantera(Number(canteraId));
  }

  @Get('stock/cantera/:canteraId/movimientos')
  getMovimientosStock(@Param('canteraId') canteraId: string) {
    return this.ventasStockService.getMovimientosByCantera(Number(canteraId));
  }

  /** Llega material a la cantera: suma a lo asignado y deja su movimiento. */
  @Post('stock/ingreso')
  registrarIngreso(@Req() req: any, @Body() body: IngresoStockDto) {
    return this.ventasStockService.registrarIngreso(req.user.id, body);
  }

  /** Corrección manual del asignado, con motivo obligatorio. */
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

  /** Retira el material del punto de venta. Solo si nunca despachó. */
  @Delete('stock/:stockId')
  retirarStock(@Param('stockId') stockId: string) {
    return this.ventasStockService.retirarMaterial(Number(stockId));
  }

  // ─── QR y catálogo ──────────────────────────────────────────────────────────
  // Van antes de @Get(':id') o Nest interpretaría "qr" y "catalog" como un id.

  @Get('qr')
  findAllQr() {
    return this.ventasQrService.findAll();
  }

  @Get('qr/scan')
  scanQr(@Query('qrcode') qrcode: string) {
    return this.ventasQrService.scan(qrcode);
  }

  @Post('qr/generate')
  generateQr(@Body() body: GenerateVentaQrDto) {
    return this.ventasQrService.generar(body.canteraIds);
  }

  @Patch('qr/:canteraId/deactivate')
  deactivateQr(@Param('canteraId') canteraId: string) {
    return this.ventasQrService.desactivar(Number(canteraId));
  }

  @Get('catalog')
  catalog() {
    return this.ventasQrService.catalog();
  }

  // ─── Consultas ──────────────────────────────────────────────────────────────

  @Get('vehiculo/:vehicleid')
  findVehiculo(@Param('vehicleid') vehicleid: string) {
    return this.ventasService.findVehiculo(vehicleid);
  }

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.ventasService.findByUser(Number(userId));
  }

  @Get('reportes/consumo')
  reporteConsumo(@Query() query: QueryVentasDto) {
    return this.ventasService.reporteConsumo(query);
  }

  @Get()
  findAll(@Query() query: QueryVentasDto) {
    return this.ventasService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ventasService.findOne(Number(id));
  }

  // ─── Registro y corrección ──────────────────────────────────────────────────

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
  create(
    @Req() req,
    @Body() body: CreateVentaDto,
    @UploadedFiles() files,
  ) {
    return this.ventasService.create(req.user.id, body, files);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateVentaDto) {
    return this.ventasService.update(Number(id), body);
  }

  /** Eliminación lógica: la fila queda, deja de listarse. */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ventasService.remove(Number(id));
  }
}
