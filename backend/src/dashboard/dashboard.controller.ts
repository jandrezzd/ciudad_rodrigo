import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '@nestjs/passport';
import { DashboardStatsDto } from './DTOs/dashboard-stats.dto';
import { DashboardTotalSummaryDto } from './DTOs/dashboard-total-summary.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('stats')
  getStats(): Promise<DashboardStatsDto> {
    return this.service.getDashboardStats();
  }

  @Get('total-summary')
  getTotalSummary(): Promise<DashboardTotalSummaryDto> {
    return this.service.getTotalSummary();
  }
}
