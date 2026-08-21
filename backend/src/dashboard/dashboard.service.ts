import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardStatsDto } from './DTOs/dashboard-stats.dto';
import { DashboardTotalSummaryDto } from './DTOs/dashboard-total-summary.dto';
import { TRIP_FULL_INCLUDE, flattenTrip, flattenTrips } from '../transport-log/flatten-trip';

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

  // Refactorizado para usar aggregate/groupBy en vez de traer filas completas
  private async getInternalVehicleTripsLast30Days() {
    const today = new Date();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const aggregates = await this.prisma.transportTrip.groupBy({
      by: ['departureAt'],
      where: {
        vehicle: { type: 'INTERNO' },
        departureAt: { gte: thirtyDaysAgo, lte: endOfToday },
      },
      _count: { id: true }
    });

    const tripsByDay: Record<string, number> = {};
    for (const d = new Date(thirtyDaysAgo); d < endOfToday; d.setDate(d.getDate() + 1)) {
        tripsByDay[d.toISOString().split('T')[0]] = 0;
    }
    
    aggregates.forEach((a) => {
      const dateStr = a.departureAt.toISOString().split('T')[0];
      if (tripsByDay[dateStr] !== undefined) {
          tripsByDay[dateStr] += a._count.id;
      }
    });

    return tripsByDay;
  }

  private async getExternalVehicleTripsLast30Days() {
    const today = new Date();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const aggregates = await this.prisma.transportTrip.groupBy({
      by: ['departureAt'],
      where: {
        vehicle: { type: 'EXTERNO' },
        departureAt: { gte: thirtyDaysAgo, lte: endOfToday },
      },
      _count: { id: true }
    });

    const tripsByDay: Record<string, number> = {};
    for (const d = new Date(thirtyDaysAgo); d < endOfToday; d.setDate(d.getDate() + 1)) {
        tripsByDay[d.toISOString().split('T')[0]] = 0;
    }

    aggregates.forEach((a) => {
      const dateStr = a.departureAt.toISOString().split('T')[0];
      if (tripsByDay[dateStr] !== undefined) {
         tripsByDay[dateStr] += a._count.id;
      }
    });

    return tripsByDay;
  }

  private async getMaterialDeliveredLast30Days() {
    const today = new Date();
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const transports = await this.prisma.transportTrip.findMany({
      where: {
        arrivalAt: { not: null, gte: thirtyDaysAgo, lte: endOfToday },
      },
      select: {
        arrivalAt: true,
        arrival: { select: { m3: true, m3Corrected: true } }
      },
    });

    const materialByDay: Record<string, number> = {};
    for (const d = new Date(thirtyDaysAgo); d < endOfToday; d.setDate(d.getDate() + 1)) {
        materialByDay[d.toISOString().split('T')[0]] = 0;
    }
    
    transports.forEach((t) => {
      if (!t.arrivalAt || !t.arrival) return;
      const dateStr = t.arrivalAt.toISOString().split('T')[0];
      const m3 = t.arrival.m3Corrected ?? t.arrival.m3 ?? 0;
      if (materialByDay[dateStr] !== undefined) {
        materialByDay[dateStr] += m3;
      }
    });

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

    const departureAgg = await this.prisma.transportDeparture.aggregate({
      where: { capturedAt: { gte: startOfDay, lt: endOfDay } },
      _sum: { m3: true }
    });

    const arrivalAgg = await this.prisma.transportArrival.aggregate({
      where: { capturedAt: { gte: startOfDay, lt: endOfDay } },
      _sum: { m3: true }
    });

    const vehicleStats = await this.prisma.vehicle.groupBy({
      by: ['type'],
      _count: { id: true }
    });

    const vehiclesByType = { internal: 0, external: 0 };
    vehicleStats.forEach(v => {
        if (v.type === 'INTERNO') vehiclesByType.internal = v._count.id;
        if (v.type === 'EXTERNO') vehiclesByType.external = v._count.id;
    });

    const totalDeparturesM3 = departureAgg._sum.m3 || 0;
    const totalArrivalsM3 = arrivalAgg._sum.m3 || 0;

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

  // Modificado para aceptar capturedAt en vez de asumir siempre "hoy" (punto 1.3 - Cambio funcional)
  async incrementDepartureCount(capturedAt?: Date): Promise<void> {
    const d = capturedAt || new Date();
    const dateStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    await this.getOrCreateDailyStats(dateStr);

    await this.prisma.dailyStats.update({
      where: { date: dateStr },
      data: {
        totalDeparturesCount: { increment: 1 },
      },
    });
  }

  // Modificado para aceptar capturedAt en vez de asumir siempre "hoy" (punto 1.3 - Cambio funcional)
  async incrementArrivalCount(capturedAt?: Date): Promise<void> {
     const d = capturedAt || new Date();
     const dateStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    await this.getOrCreateDailyStats(dateStr);

    await this.prisma.dailyStats.update({
      where: { date: dateStr },
      data: {
        totalArrivalsCount: { increment: 1 },
      },
    });
  }
  
  // AÃ±adido func de reparaciÃ³n como dictaba el plan 1.3
  async recomputeDailyStats(dateStr: string): Promise<void> {
      const startOfDay = new Date(`${dateStr}T00:00:00Z`); // UTC asumiendo string ISO
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
      
      const departures = await this.prisma.transportDeparture.count({
          where: { capturedAt: { gte: startOfDay, lt: endOfDay } }
      });
      const arrivals = await this.prisma.transportArrival.count({
          where: { capturedAt: { gte: startOfDay, lt: endOfDay } }
      });
      
      await this.prisma.dailyStats.upsert({
          where: { date: dateStr },
          create: { date: dateStr, totalDeparturesCount: departures, totalArrivalsCount: arrivals },
          update: { totalDeparturesCount: departures, totalArrivalsCount: arrivals }
      });
  }

  async getTotalSummary(): Promise<DashboardTotalSummaryDto> {
    const asOfDate = new Date().toISOString().split('T')[0];

    // Ahora agregamos desde DB en vez de jalar todo a memoria
    const allTransports = await this.prisma.transportTrip.findMany({
      select: {
        departureAt: true,
        arrivalAt: true,
        deviationM3: true,
        departure: { select: { m3: true, m3Corrected: true } },
        arrival: { select: { m3: true, m3Corrected: true } },
        material: { select: { materialType: true } },
      },
    });

    let totalDeparturesM3 = 0;
    let totalArrivalsM3 = 0;
    let totalDeviation = 0;
    const materialDeliveredByType: Record<string, number> = {};

    allTransports.forEach((t) => {
      const dM3 = t.departure?.m3Corrected ?? t.departure?.m3 ?? 0;
      totalDeparturesM3 += dM3;

      if (!t.arrivalAt) return;

      const aM3 = t.arrival?.m3Corrected ?? t.arrival?.m3 ?? 0;
      totalArrivalsM3 += aM3;
      totalDeviation += t.deviationM3 ?? 0;

      const materialType = t.material?.materialType ?? 'Sin material';
      materialDeliveredByType[materialType] =
        (materialDeliveredByType[materialType] || 0) + aM3;
    });

    Object.keys(materialDeliveredByType).forEach((key) => {
      materialDeliveredByType[key] =
        Math.round(materialDeliveredByType[key] * 100) / 100;
    });

    const totalDepartures = allTransports.length;
    const totalArrivals = allTransports.filter((t) => t.arrivalAt != null).length;

    const vehicleStats = await this.prisma.vehicle.groupBy({
      by: ['type'],
      _count: { id: true },
    });

    const vehiclesByType = { internal: 0, external: 0 };
    vehicleStats.forEach((v) => {
      if (v.type === 'INTERNO') vehiclesByType.internal = v._count.id;
      if (v.type === 'EXTERNO') vehiclesByType.external = v._count.id;
    });

    const totalClients = await this.prisma.client.count();
    const totalConstSites = await this.prisma.constSite.count();
    const totalOwners = await this.prisma.owner.count();
    const totalPlannings = await this.prisma.planning.count();

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
