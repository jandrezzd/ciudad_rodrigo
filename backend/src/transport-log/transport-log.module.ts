import { Module } from '@nestjs/common';
import { TransportLogService } from './transport-log.service';
import { TransportLogController } from './transport-log.controller';
import { CanteraStockService } from './cantera-stock.service';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [DashboardModule],
  providers: [TransportLogService, CanteraStockService],
  controllers: [TransportLogController],
  exports: [CanteraStockService],
})
export class TransportLogModule {}
