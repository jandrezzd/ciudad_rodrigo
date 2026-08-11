import { Module } from '@nestjs/common';
import { TransportLogService } from './transport-log.service';
import { TransportLogController } from './transport-log.controller';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [DashboardModule],
  providers: [TransportLogService],
  controllers: [TransportLogController]
})
export class TransportLogModule {}
