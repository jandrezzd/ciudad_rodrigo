import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardStatsDto } from './DTOs/dashboard-stats.dto';
import { DashboardTotalSummaryDto } from './DTOs/dashboard-total-summary.dto';

@Injectable()
export class DashboardService {

  constructor(private prisma: PrismaService) {}

  private async getOrCreateDailyStats(dateStr: string) {
    return this.prisma.dailyStats.upsert({
      where: { date: dateStr },
      update: {},
      create: {
        date: dateStr,
        totalDeparturesCount: 0,
        totalArrivalsCount: 0,
      },
    });
  }

  private async getInternalVehicleTripsLast30Days() {
    const today = new Date();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const transports = await this.prisma.transportLog.findMany({
      where: {
        vehicle: {
          type: 'INTERNO',
        },
        departureAt: {
          gte: thirtyDaysAgo,
          lte: endOfToday,
        },
      },
      select: {
        departureAt: true,
      },
    });

    const tripsByDay: Record<string, number> = {};
    transports.forEach((t) => {
      const dateStr = t.departureAt.toISOString().split('T')[0];
      tripsByDay[dateStr] = (tripsByDay[dateStr] || 0) + 1;
    });

    return tripsByDay;
  }

  private async getExternalVehicleTripsLast30Days() {
    const today = new Date();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const transports = await this.prisma.transportLog.findMany({
      where: {
        vehicle: {
          type: 'EXTERNO',
        },
        departureAt: {
          gte: thirtyDaysAgo,
          lte: endOfToday,
        },
      },
      select: {
        departureAt: true,
      },
    });

    const tripsByDay: Record<string, number> = {};
    transports.forEach((t) => {
      const dateStr = t.departureAt.toISOString().split('T')[0];
      tripsByDay[dateStr] = (tripsByDay[dateStr] || 0) + 1;
    });

    return tripsByDay;
  }

  private async getMaterialDeliveredLast30Days() {
    const today = new Date();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const transports = await this.prisma.transportLog.findMany({
      where: {
        arrivalAt: {
          not: null,
          gte: thirtyDaysAgo,
          lte: endOfToday,
        },
      },
      select: {
        arrivalAt: true,
        arrivalM3Corrected: true,
        arrivalM3: true,
      },
    });

    const materialByDay: Record<string, number> = {};
    transports.forEach((t) => {
      const dateStr = (t.arrivalAt as Date).toISOString().split('T')[0];
      const m3 = t.arrivalM3Corrected ?? t.arrivalM3 ?? 0;
      materialByDay[dateStr] = (materialByDay[dateStr] || 0) + m3;
    });

    // Redondear a 2 decimales
    Object.keys(materialByDay).forEach((key) => {
      materialByDay[key] = Math.round(materialByDay[key] * 100) / 100;
    });

    return materialByDay;
  }

  async getDashboardStats(): Promise<DashboardStatsDto> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const dateStr = startOfDay.toISOString().split('T')[0];
    const dailyStats = await this.getOrCreateDailyStats(dateStr);

    const allDepartures = await this.prisma.transportLog.findMany({
      where: {
        departureAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      select: {
        departureM3: true,
      },
    });

    const allArrivals = await this.prisma.transportLog.findMany({
      where: {
        arrivalAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      select: {
        arrivalM3: true,
      },
    });

    const vehicleStats = await this.prisma.vehicle.findMany({
      select: {
        type: true,
      },
    });

    const vehiclesByType = vehicleStats.reduce(
      (acc, vehicle) => {
        if (vehicle.type === 'INTERNO') {
          acc.internal++;
        } else if (vehicle.type === 'EXTERNO') {
          acc.external++;
        }
        return acc;
      },
      { internal: 0, external: 0 },
    );

    const totalDeparturesM3 = allDepartures.reduce((sum, d) => sum + (d.departureM3 || 0), 0);
    const totalArrivalsM3 = allArrivals.reduce((sum, a) => sum + (a.arrivalM3 || 0), 0);

    // Obtener métricas de últimos 30 días
    const internalTripsLast30 = await this.getInternalVehicleTripsLast30Days();
    const externalTripsLast30 = await this.getExternalVehicleTripsLast30Days();
    const materialDeliveredLast30 = await this.getMaterialDeliveredLast30Days();

    const result: DashboardStatsDto = {
      totalDeparturesM3: Math.round(totalDeparturesM3 * 100) / 100,
      totalArrivalsM3: Math.round(totalArrivalsM3 * 100) / 100,
      totalDepartures: dailyStats.totalDeparturesCount,
      totalArrivals: dailyStats.totalArrivalsCount,
      totalVehicleExternal: vehiclesByType.external,
      totalVehicleInternal: vehiclesByType.internal,
      date: dateStr,
      internalVehicleTripsLast30Days: internalTripsLast30,
      externalVehicleTripsLast30Days: externalTripsLast30,
      materialDeliveredLast30Days: materialDeliveredLast30,
    };

    return result;
  }

  async incrementDepartureCount(): Promise<void> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateStr = startOfDay.toISOString().split('T')[0];

    await this.getOrCreateDailyStats(dateStr);

    await this.prisma.dailyStats.update({
      where: { date: dateStr },
      data: {
        totalDeparturesCount: {
          increment: 1,
        },
      },
    });
  }

  async incrementArrivalCount(): Promise<void> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateStr = startOfDay.toISOString().split('T')[0];

    await this.getOrCreateDailyStats(dateStr);

    await this.prisma.dailyStats.update({
      where: { date: dateStr },
      data: {
        totalArrivalsCount: {
          increment: 1,
        },
      },
    });
  }

  async getTotalSummary(): Promise<DashboardTotalSummaryDto> {
    const asOfDate = new Date().toISOString().split('T')[0];

    const allTransports = await this.prisma.transportLog.findMany({
      select: {
        departureAt: true,
        arrivalAt: true,
        departureM3: true,
        departureM3Corrected: true,
        arrivalM3: true,
        arrivalM3Corrected: true,
        deviationM3: true,
        material: {
          select: {
            materialType: true,
          },
        },
      },
    });

    const totalDeparturesM3 = allTransports.reduce((sum, t) => {
      return sum + (t.departureM3Corrected ?? t.departureM3 ?? 0);
    }, 0);

    const totalArrivalsM3 = allTransports.reduce((sum, t) => {
      if (!t.arrivalAt) return sum;
      return sum + (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0);
    }, 0);

    const totalDeviation = allTransports.reduce((sum, t) => {
      if (!t.arrivalAt) return sum;
      return sum + (t.deviationM3 || 0);
    }, 0);

    const totalDepartures = allTransports.length;
    const totalArrivals = allTransports.filter((t) => t.arrivalAt != null).length;

    const vehicleStats = await this.prisma.vehicle.findMany({ select: { type: true,},
    });

    const vehiclesByType = vehicleStats.reduce(
      (acc, vehicle) => {
        if (vehicle.type === 'INTERNO') {
          acc.internal++;
        } else if (vehicle.type === 'EXTERNO') {
          acc.external++;
        }
        return acc;
      },
      { internal: 0, external: 0 },
    );

    const totalClients = await this.prisma.client.count();
    const totalConstSites = await this.prisma.constSite.count();
    const totalOwners = await this.prisma.owner.count();
    const totalPlannings = await this.prisma.planning.count();

    const materialDeliveredByType: Record<string, number> = {};
    allTransports.forEach((t) => {
      if (!t.arrivalAt) return;
      const materialType = t.material?.materialType ?? 'Sin material';
      const m3 = t.arrivalM3Corrected ?? t.arrivalM3 ?? 0;
      materialDeliveredByType[materialType] = (materialDeliveredByType[materialType] || 0) + m3;
    });

    Object.keys(materialDeliveredByType).forEach((key) => {
      materialDeliveredByType[key] = Math.round(materialDeliveredByType[key] * 100) / 100;
    });

    const result: DashboardTotalSummaryDto = {
      date: asOfDate,
      totalDeparturesM3: Math.round(totalDeparturesM3 * 100) / 100,
      totalArrivalsM3: Math.round(totalArrivalsM3 * 100) / 100,
      totalDeviation: Math.round(totalDeviation * 100) / 100,
      totalDepartures,
      totalArrivals,
      totalVehicleExternal: vehiclesByType.external,
      totalVehicleInternal: vehiclesByType.internal,
      totalClients,
      totalConstSites,
      totalOwners,
      totalPlannings,
      materialDeliveredByType,
    };

    return result;
  }
}

