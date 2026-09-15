import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasQrService } from './ventas-qr.service';
import { VentasStockService } from './ventas-stock.service';
import { VentasController } from './ventas.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VentasController],
  providers: [VentasService, VentasQrService, VentasStockService],
  exports: [VentasService, VentasStockService],
})
export class VentasModule {}
