import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TransportistasService } from './transportistas.service';
import { TransportistaDto } from './DTOs/transportista.dto';

/**
 * Transportistas de las órdenes de venta. No tienen pantalla propia: se
 * eligen o crean desde el formulario de la orden, así que usan los permisos
 * de `ventas-ordenes`.
 */
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('transportistas')
export class TransportistasController {
  constructor(private transportistas: TransportistasService) {}

  @RequirePermission('ventas-ordenes', 'view')
  @Get()
  findAll() {
    return this.transportistas.findAll();
  }

  @RequirePermission('ventas-ordenes', ['create', 'edit'])
  @Post()
  create(@Body() body: TransportistaDto) {
    return this.transportistas.create(body.name);
  }

  @RequirePermission('ventas-ordenes', ['create', 'edit'])
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TransportistaDto,
  ) {
    return this.transportistas.update(id, body.name);
  }
}
