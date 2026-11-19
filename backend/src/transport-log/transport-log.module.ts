import { Module } from '@nestjs/common';
import { TransportLogService } from './transport-log.service';
import { TransportLogController } from './transport-log.controller';
import { CanteraStockService } from './cantera-stock.service';
import { ReconciliationService } from './reconciliation/reconciliation.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { UbicacionLlegadaModule } from './ubicacion-llegada.module';

@Module({
  imports: [DashboardModule, UbicacionLlegadaModule],
  providers: [TransportLogService, CanteraStockService, ReconciliationService],
  controllers: [TransportLogController],
  exports: [CanteraStockService, ReconciliationService],
})
export class TransportLogModule {}
