import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasQrService } from './ventas-qr.service';
import { VentasStockService } from './ventas-stock.service';
import { VentasOrdenesService } from './ventas-ordenes.service';
import { VentasController } from './ventas.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, TelegramModule],
  controllers: [VentasController],
  providers: [
    VentasService,
    VentasQrService,
    VentasStockService,
    VentasOrdenesService,
  ],
  exports: [VentasService, VentasStockService, VentasOrdenesService],
})
export class VentasModule {}
