import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { flattenTrips } from '../transport-log/flatten-trip';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  private parseDateRangeUTC(startDateStr: string, endDateStr: string) {
    const parseDate = (dateStr: string): Date => {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    };

    const start = parseDate(startDateStr);
    const end = parseDate(endDateStr);
    end.setUTCHours(23, 59, 59, 999);

    return { start, end };
  }

  private calcReportStatus(transports: { status: string }[]): string {
    if (transports.length === 0) return 'NORMAL';

    const hasAlerta = transports.some((t) => t.status === 'ALERTA');
    if (hasAlerta) return 'ALERTA';

    const allValidado = transports.every((t) => t.status === 'VALIDADO');
    if (allValidado) return 'VALIDADO';

    const allRevisadoOrValidado = transports.every(
      (t) => t.status === 'REVISADO' || t.status === 'VALIDADO',
    );
    if (allRevisadoOrValidado) return 'REVISADO';

    return 'NORMAL';
  }

  async getOwnerTransportReport(
    ownerId: number,
    startDate: string,
    endDate: string,
  ) {
    try {
      const owner = await this.prisma.owner.findUnique({
        where: { id: ownerId },
      });

      if (!owner) {
        throw new NotFoundException(
          `Propietario con ID ${ownerId} no encontrado`,
        );
      }

      const { start, end } = this.parseDateRangeUTC(startDate, endDate);

      if (start > end) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser mayor a la fecha de fin',
        );
      }

      const vehicles = await this.prisma.vehicle.findMany({ include: { driver: true, owner: true }, where: { ownerId, isActive: true }});

      if (vehicles.length === 0) {
        return {
          success: true,
          owner,
          period: { startDate: start, endDate: end },
          vehicles: [],
          totalMovements: 0,
          totalM3: 0,
        };
      }

      const vehicleIds = vehicles.map((v) => v.id);

      const transports = flattenTrips(await this.prisma.transportTrip.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          departureAt: { gte: start, lte: end },
        },
        include: {
          vehicle: true,
          constSite: true,
          client: true,
          material: { select: { id: true, materialType: true } }, 
          user: { select: { id: true, name: true, email: true } },
          departure: true,
          arrival: true,
        },
        orderBy: [{ vehicleId: 'asc' }, { departureAt: 'desc' }],
      }));

      const vehicleReport = vehicles.map((vehicle) => {
        const vehicleMovements = transports.filter(
          (t) => t.vehicleId === vehicle.id,
        );

        const totalMovements = vehicleMovements.length;
        const totalDepartureM3 = vehicleMovements.reduce(
          (sum, t) => sum + (t.departureM3 || 0),
          0,
        );
        const totalArrivalM3 = vehicleMovements.reduce(
          (sum, t) => sum + (t.arrivalM3 || 0),
          0,
        );

        return {
          vehicle: {
            id: vehicle.id,
            vehicleid: vehicle.vehicleid,
            plate: vehicle.plate,
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            type: vehicle.type,
            capacity: vehicle.capacity,
            driver: vehicle.driver? {
              id: vehicle.driver.id,
              name: vehicle.driver.name,
              document: vehicle.driver.document,
              phone: vehicle.driver.phone,
            } : null,
          },
          totalMovements,
          totalDepartureM3: Number(totalDepartureM3.toFixed(2)),
          totalArrivalM3: Number(totalArrivalM3.toFixed(2)),
          movements: vehicleMovements.map((t) => ({
            id: t.id,
            departureAt: t.departureAt,
            arrivalAt: t.arrivalAt,
            status: t.status,
            departureM3: t.departureM3,
            arrivalM3: t.arrivalM3,
            material: t.material?.materialType ?? null, 
            coordenadas: {
              salida: { lat: t.departureLat, lng: t.departureLng },
              llegada: { lat: t.arrivalLat, lng: t.arrivalLng },
            },
            obras: {
              id: t.constSiteId,
              name: t.constSite?.name,
              address: t.constSite?.address,
            },
            cliente: t.client
              ? {
                  id: t.client.id,
                  name: t.client.name,
                  companyname: t.client.companyname,
                }
              : null,
            usuario: {
              id: t.user.id,
              name: t.user.name,
              email: t.user.email,
            },
          })),
        };
      });

      const totalAllMovements = transports.length;
      const totalAllDepartureM3 = transports.reduce(
        (sum, t) => sum + (t.departureM3 || 0),
        0,
      );

      const reportStatus = this.calcReportStatus(transports); 

      const reportData = {
        success: true,
        status: reportStatus,
        owner: {
          id: owner.id,
          name: owner.name,
          companyname: owner.companyname,
          ruc: owner.ruc,
        },
        period: { startDate: start, endDate: end },
        summary: {
          totalMovements: totalAllMovements,
          totalDepartureM3: Number(totalAllDepartureM3.toFixed(2)),
          totalVehicles: vehicleReport.filter((v) => v.totalMovements > 0)
            .length,
        },
        vehicles: vehicleReport.filter((v) => v.totalMovements > 0),
      };

      await this.prisma.report.create({
        data: {
          ownerId: owner.id,
          startDate: start,
          endDate: end,
          status: reportStatus as any,
          reportData: reportData,
        },
      });

      return reportData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en getOwnerTransportReport: ${errorMessage}`);
      throw error;
    }
  }

  async getVehicleDetailReport(
    vehicleId: number,
    startDate: string,
    endDate: string,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({ include: { driver: true, owner: true }, where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehículo con ID ${vehicleId} no encontrado`);
    }

    const { start, end } = this.parseDateRangeUTC(startDate, endDate);

    const transports = flattenTrips(await this.prisma.transportTrip.findMany({
      where: {
        vehicleId,
        departureAt: { gte: start, lte: end },
      },
      include: {
        constSite: true,
        client: true,
        material: { select: { id: true, materialType: true } }, 
        user: { select: { id: true, name: true, email: true } },
        departure: true,
        arrival: true,
      },
      orderBy: { departureAt: 'desc' },
    }));

    return {
      success: true,
      vehicle: {
        id: vehicle.id,
        vehicleid: vehicle.vehicleid,
        plate: vehicle.plate,
        driver: vehicle.driver
          ? {
              id: vehicle.driver.id,
              name: vehicle.driver.name,
              document: vehicle.driver.document,
              phone: vehicle.driver.phone,
            }
          : null,
        owner: vehicle.owner
          ? {
              id: vehicle.owner.id,
              name: vehicle.owner.name,
              companyname: vehicle.owner.companyname,
            }
          : null,
      },
      period: { startDate: start, endDate: end },
      transports: transports.map((t) => ({
        ...t,
        material: t.material?.materialType ?? null, 
      })),
      totalMovements: transports.length,
      totalM3: transports.reduce((sum, t) => sum + (t.departureM3 || 0), 0),
    };
  }

  async getOwners() {
    const owners = await this.prisma.owner.findMany({
      where: { isActive: true },
      include: { _count: { select: { vehicles: true } } },
      orderBy: { companyname: 'asc' },
    });

    return {
      success: true,
      owners: owners.map((o) => ({
        id: o.id,
        name: o.name,
        companyname: o.companyname,
        ruc: o.ruc,
        vehicleCount: o._count.vehicles,
      })),
    };
  }

  async getTotalM3ByConstSite(constSiteId: number, startDate?: string, endDate?: string) {
    try {
      const constSite = await this.prisma.constSite.findUnique({
        where: { id: constSiteId },
      });

      if (!constSite) {
        throw new NotFoundException(`Obra con ID ${constSiteId} no encontrada`);
      }

      const whereClause: any = { constSiteId, arrivalAt: { not: null } };

      if (startDate && endDate) {
        const { start, end } = this.parseDateRangeUTC(startDate, endDate);
        whereClause.departureAt = { gte: start, lte: end };
      }

      const transports = flattenTrips(await this.prisma.transportTrip.findMany({
        where: whereClause,
        include: {
          vehicle: {
            select: {
              vehicleid: true,
              plate: true,
              brand: true,
              model: true,
              type: true,
              company: true,
              owner: { select: { id: true, name: true, companyname: true } },
            },
          },
          planning: { select: { id: true, planningCode: true } },
          client: { select: { id: true, name: true, companyname: true } },
          material: { select: { id: true, materialType: true } }, 
          departure: true,
          arrival: true,
        },
        orderBy: { arrivalAt: 'desc' },
      }));

      const totalArrivalM3 = transports.reduce(
        (sum, t) => sum + (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0),
        0,
      );
      const totalDepartureM3 = transports.reduce(
        (sum, t) => sum + (t.departureM3Corrected ?? t.departureM3 ?? 0),
        0,
      );
      const uniqueVehicles = new Set(transports.map((t) => t.vehicleId)).size;

      // Vículos internos: tienen campo company definido (pertenecen a la empresa)
      // Vículos externos: su company es null/undefined (son de proveedores externos)
      const internalVehicleIds = new Set(
        transports.filter((t) => t.vehicle?.company != null).map((t) => t.vehicleId),
      );
      const externalVehicleIds = new Set(
        transports.filter((t) => t.vehicle?.company == null).map((t) => t.vehicleId),
      );

      return {
        success: true,
        constSite: {
          id: constSite.id,
          name: constSite.name,
          province: constSite.province,
          canton: constSite.canton,
          address: constSite.address,
        },
        summary: {
          totalDeliveries: transports.length,
          totalM3Delivered: Number(totalArrivalM3.toFixed(2)),
          totalM3Departed: Number(totalDepartureM3.toFixed(2)),
          deviation: Number((totalDepartureM3 - totalArrivalM3).toFixed(2)),
          uniqueVehicles,
          uniqueInternalVehicles: internalVehicleIds.size,
          uniqueExternalVehicles: externalVehicleIds.size,
        },
        deliveries: transports.map((t) => ({
          id: t.id,
          status: t.status,
          departureAt: t.departureAt,
          arrivalAt: t.arrivalAt,
          departureM3: t.departureM3,
          departureM3Corrected: t.departureM3Corrected,
          arrivalM3: t.arrivalM3,
          arrivalM3Corrected: t.arrivalM3Corrected,
          deviationM3: t.deviationM3,
          material: t.material?.materialType ?? null, 
          vehicle: t.vehicle,
          planning: t.planning
            ? { id: t.planning.id, planningCode: t.planning.planningCode }
            : null,
          client: t.client,
        })),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en getTotalM3ByConstSite: ${errorMessage}`);
      throw error;
    }
  }

  async getTotalM3ByPlanning(planningId: number) {
    try {
      const planning = await this.prisma.planning.findUnique({
        where: { id: planningId },
        include: {
          client: { select: { id: true, name: true, companyname: true } },
          constSite: { select: { id: true, name: true } },
        },
      });

      if (!planning) {
        throw new NotFoundException(
          `Planificación con ID ${planningId} no encontrada`,
        );
      }

      const transports = flattenTrips(await this.prisma.transportTrip.findMany({
        where: { planningId, arrivalAt: { not: null } },
        include: {
          vehicle: {
            select: {
              vehicleid: true,
              plate: true,
              brand: true,
              model: true,
              type: true,
              owner: { select: { id: true, name: true, companyname: true } },
            },
          },
          owner: { select: { id: true, name: true, companyname: true } },
          material: { select: { id: true, materialType: true } },
          departure: true,
          arrival: true,
        },
        orderBy: { arrivalAt: 'desc' },
      }));

      const totalArrivalM3 = transports.reduce(
        (sum, t) => sum + (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0),
        0,
      );
      const totalDepartureM3 = transports.reduce(
        (sum, t) => sum + (t.departureM3Corrected ?? t.departureM3 ?? 0),
        0,
      );
      const uniqueVehicles = new Set(transports.map((t) => t.vehicleId)).size;
      const uniqueOwners = new Set(transports.map((t) => t.ownerId)).size;

      return {
        success: true,
        planning: {
          id: planning.id,
          planningCode: planning.planningCode,
          description: planning.description,
          status: planning.status,
          startDate: planning.startDate,
          endDate: planning.endDate,
          client: planning.client,
          constSite: planning.constSite,
        },
        summary: {
          totalDeliveries: transports.length,
          totalM3Delivered: Number(totalArrivalM3.toFixed(2)),
          totalM3Departed: Number(totalDepartureM3.toFixed(2)),
          deviation: Number((totalDepartureM3 - totalArrivalM3).toFixed(2)),
          uniqueVehicles,
          uniqueOwners,
        },
        deliveries: transports.map((t) => ({
          id: t.id,
          status: t.status,
          departureAt: t.departureAt,
          arrivalAt: t.arrivalAt,
          departureM3: t.departureM3,
          departureM3Corrected: t.departureM3Corrected,
          arrivalM3: t.arrivalM3,
          arrivalM3Corrected: t.arrivalM3Corrected,
          deviationM3: t.deviationM3,
          material: t.material?.materialType ?? null, 
          vehicle: t.vehicle,
          owner: t.owner,
        })),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en getTotalM3ByPlanning: ${errorMessage}`);
      throw error;
    }
  }

  async getClients() {
    const clients = await this.prisma.client.findMany({
      where: { isActive: true },
      include: { _count: { select: { trips: true } } },
      orderBy: { companyname: 'asc' },
    });

    return {
      success: true,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        companyname: c.companyname,
        ruc: c.ruc,
        type: c.type,
        movementCount: c._count.trips,
      })),
    };
  }

  async getClientTransportReport(
    clientId: number,
    startDate: string,
    endDate: string,
  ) {
    try {
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
      });

      if (!client) {
        throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
      }

      const { start, end } = this.parseDateRangeUTC(startDate, endDate);

      if (start > end) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser mayor a la fecha de fin',
        );
      }

      const transports = flattenTrips(await this.prisma.transportTrip.findMany({
        where: {
          clientId,
          departureAt: { gte: start, lte: end },
        },
        include: {
          vehicle: { include: { owner: true } },
          constSite: true,
          planning: { select: { id: true, planningCode: true } },
          material: { select: { id: true, materialType: true } }, 
          user: { select: { id: true, name: true, email: true } },
          departure: true,
          arrival: true,
        },
        orderBy: { departureAt: 'desc' },
      }));

      const movementsByConstSite: Map<number, any[]> = new Map();
      transports.forEach((movement) => {
        const siteId = movement.constSiteId;
        if (!movementsByConstSite.has(siteId)) {
          movementsByConstSite.set(siteId, []);
        }
        movementsByConstSite.get(siteId)?.push(movement);
      });

      const movementsByVehicle: Map<number, any[]> = new Map();
      transports.forEach((movement) => {
        if (!movementsByVehicle.has(movement.vehicleId)) {
          movementsByVehicle.set(movement.vehicleId, []);
        }
        movementsByVehicle.get(movement.vehicleId)?.push(movement);
      });

      const movementsByOwner: Map<number | string, any[]> = new Map();
      transports.forEach((movement) => {
        const key = movement.vehicle?.ownerId ?? 'internal';
        if (!movementsByOwner.has(key)) {
          movementsByOwner.set(key, []);
        }
        movementsByOwner.get(key)?.push(movement);
      });

      const totalDepartureM3 = transports.reduce(
        (sum, t) => sum + (t.departureM3Corrected ?? t.departureM3 ?? 0),
        0,
      );
      const totalArrivalM3 = transports.reduce(
        (sum, t) => sum + (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0),
        0,
      );
      const totalDeviationM3 = transports.reduce(
        (sum, t) => sum + (t.deviationM3 ?? 0),
        0,
      );

      const reportStatus = this.calcReportStatus(transports); 

      const reportData = {
        success: true,
        status: reportStatus,
        client: {
          id: client.id,
          name: client.name,
          companyname: client.companyname,
          ruc: client.ruc,
          type: client.type,
        },
        period: { startDate: start, endDate: end },
        summary: {
          totalMovements: transports.length,
          totalDepartureM3: Number(totalDepartureM3.toFixed(2)),
          totalArrivalM3: Number(totalArrivalM3.toFixed(2)),
          totalDeviation: Number(totalDeviationM3.toFixed(2)),
          uniqueVehicles: movementsByVehicle.size,
          uniqueProviders: movementsByOwner.size,
          uniqueConstSites: movementsByConstSite.size,
        },
        byConstSite: Array.from(movementsByConstSite.entries()).map(
          ([_, siteMovements]) => {
            const siteDepartureM3 = siteMovements.reduce(
              (sum, t) => sum + (t.departureM3Corrected ?? t.departureM3 ?? 0),
              0,
            );
            const siteArrivalM3 = siteMovements.reduce(
              (sum, t) => sum + (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0),
              0,
            );
            return {
              constSite: {
                id: siteMovements[0].constSite.id,
                name: siteMovements[0].constSite.name,
                address: siteMovements[0].constSite.address,
              },
              movements: siteMovements.length,
              totalDepartureM3: Number(siteDepartureM3.toFixed(2)),
              totalArrivalM3: Number(siteArrivalM3.toFixed(2)),
              totalDeviation: Number(
                (siteDepartureM3 - siteArrivalM3).toFixed(2),
              ),
            };
          },
        ),
        movements: transports.map((t) => ({
          id: t.id,
          departureAt: t.departureAt,
          arrivalAt: t.arrivalAt,
          status: t.status,
          departureM3: t.departureM3,
          departureM3Corrected: t.departureM3Corrected,
          arrivalM3: t.arrivalM3,
          arrivalM3Corrected: t.arrivalM3Corrected,
          deviationM3: t.deviationM3,
          material: t.material?.materialType ?? null, 
          vehicle: {
            id: t.vehicle.id,
            vehicleid: t.vehicle.vehicleid,
            plate: t.vehicle.plate,
            brand: t.vehicle.brand,
            model: t.vehicle.model,
            type: t.vehicle.type,
            provider: t.vehicle.owner
              ? {
                  id: t.vehicle.owner.id,
                  name: t.vehicle.owner.name,
                  companyname: t.vehicle.owner.companyname,
                }
              : null,
          },
          constSite: {
            id: t.constSite.id,
            name: t.constSite.name,
          },
          planning: t.planning
            ? { id: t.planning.id, planningCode: t.planning.planningCode }
            : null,
          registeredBy: {
            id: t.user.id,
            name: t.user.name,
            email: t.user.email,
          },
        })),
      };

      await this.prisma.report.create({
        data: {
          clientId: client.id,
          startDate: start,
          endDate: end,
          status: reportStatus as any,
          reportData: reportData,
        },
      });

      return reportData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en getClientTransportReport: ${errorMessage}`);
      throw error;
    }
  }

  async getSupervisors() {
    const supervisors = await this.prisma.user.findMany({
      where: { role: 'SUPERVISOR', isActive: true },
      select: { id: true, name: true, email: true, roletype: true },
      orderBy: { name: 'asc' },
    });

    return { success: true, supervisors };
  }

  async getJefesDeObra() {
    const jefes = await this.prisma.user.findMany({
      where: { role: 'JEFE_DE_OBRA', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });

    return { success: true, jefes };
  }

  async getSupervisorReport(
    supervisorId: number,
    startDate: string,
    endDate: string,
  ) {
    try {
      const supervisor = await this.prisma.user.findUnique({
        where: { id: supervisorId },
      });

      if (!supervisor || supervisor.role !== 'SUPERVISOR') {
        throw new NotFoundException(
          `Supervisor con ID ${supervisorId} no encontrado`,
        );
      }

      const { start, end } = this.parseDateRangeUTC(startDate, endDate);

      if (start > end) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser mayor a la fecha de fin',
        );
      }

      const transports = flattenTrips(await this.prisma.transportTrip.findMany({
        where: {
          OR: [{ userId: supervisorId }, { userArrivalId: supervisorId }],
          departureAt: { gte: start, lte: end },
        },
        include: {
          vehicle: true,
          constSite: true,
          client: true,
          material: { select: { id: true, materialType: true } }, 
          user: { select: { name: true } },
          userArrival: { select: { name: true } },
          departure: true,
          arrival: true,
        },
        orderBy: { departureAt: 'desc' },
      }));

      const departuresCount = transports.filter(
        (t) => t.userId === supervisorId,
      ).length;
      const arrivalsCount = transports.filter(
        (t) => t.userArrivalId === supervisorId,
      ).length;

      return {
        success: true,
        supervisor: {
          id: supervisor.id,
          name: supervisor.name,
          email: supervisor.email,
          roleType: supervisor.roletype,
        },
        period: { startDate: start, endDate: end },
        summary: {
          totalActions: transports.length,
          totalDeparturesManaged: departuresCount,
          totalArrivalsManaged: arrivalsCount,
          totalM3Supervised: transports.reduce((sum, t) => {
            const isDeparture = t.userId === supervisorId;
            const value = isDeparture
              ? (t.departureM3Corrected ?? t.departureM3 ?? 0)
              : (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0);
            return sum + value;
          }, 0),
        },
        details: transports.map((t) => ({
          id: t.id,
          date: t.departureAt,
          action: t.userId === supervisorId ? 'SALIDA' : 'LLEGADA',
          status: t.status,
          material: t.material?.materialType ?? null, 
          vehicle: {
            plate: t.vehicle.plate,
            vehicleid: t.vehicle.vehicleid,
          },
          constSite: t.constSite?.name,
          m3: t.userId === supervisorId ? t.departureM3 : t.arrivalM3,
        })),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en getSupervisorReport: ${errorMessage}`);
      throw error;
    }
  }

  async getMaterialByConstSite(
    materialId: number,
    startDate: string,
    endDate: string,
    constSiteId?: number,
  ) {
    try {
      const material = await this.prisma.material.findUnique({
        where: { id: materialId },
      });

      if (!material) {
        throw new NotFoundException(`Material con ID ${materialId} no encontrado`);
      }

      const { start, end } = this.parseDateRangeUTC(startDate, endDate);

      if (start > end) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser mayor a la fecha de fin',
        );
      }

      const whereClause: any = {
        materialId,
        arrivalAt: { not: null },
        departureAt: { gte: start, lte: end },
      };

      if (constSiteId) {
        whereClause.constSiteId = constSiteId;
      }

      const transports = flattenTrips(await this.prisma.transportTrip.findMany({
        where: whereClause,
        include: {
          vehicle: {
            select: {
              vehicleid: true,
              plate: true,
              brand: true,
              model: true,
              type: true,
              company: true,
              owner: { select: { id: true, name: true, companyname: true } },
            },
          },
          planning: { select: { id: true, planningCode: true } },
          client: { select: { id: true, name: true, companyname: true } },
          constSite: { select: { id: true, name: true } },
          material: { select: { id: true, materialType: true } }, 
          departure: true,
          arrival: true,
        },
        orderBy: { arrivalAt: 'desc' },
      }));

      const totalArrivalM3 = transports.reduce(
        (sum, t) => sum + (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0),
        0,
      );
      const totalDepartureM3 = transports.reduce(
        (sum, t) => sum + (t.departureM3Corrected ?? t.departureM3 ?? 0),
        0,
      );
      const uniqueVehicles = new Set(transports.map((t) => t.vehicleId)).size;
      const uniqueConstSites = new Set(transports.map((t) => t.constSiteId)).size;
      const internalVehicleIds = new Set(
        transports.filter((t) => t.vehicle?.company != null).map((t) => t.vehicleId),
      );
      const externalVehicleIds = new Set(
        transports.filter((t) => t.vehicle?.company == null).map((t) => t.vehicleId),
      );

      const m3ByMaterial: Record<string, number> = {};
      transports.forEach((t) => {
        const tipo = t.material?.materialType ?? 'SIN_MATERIAL';
        const m3 = t.arrivalM3Corrected ?? t.arrivalM3 ?? 0;
        m3ByMaterial[tipo] = (m3ByMaterial[tipo] ?? 0) + m3;
      });

      const response: any = {
        success: true,
        material: {
          id: material.id,
          materialType: material.materialType,
        },
        period: { startDate: start, endDate: end },
        summary: {
          totalDeliveries: transports.length,
          totalM3Delivered: Number(totalArrivalM3.toFixed(2)),
          totalM3Departed: Number(totalDepartureM3.toFixed(2)),
          deviation: Number((totalDepartureM3 - totalArrivalM3).toFixed(2)),
          uniqueVehicles,
          uniqueConstSites,
          uniqueInternalVehicles: internalVehicleIds.size,
          uniqueExternalVehicles: externalVehicleIds.size,
        },
        deliveries: transports.map((t) => ({
          id: t.id,
          status: t.status,
          departureAt: t.departureAt,
          arrivalAt: t.arrivalAt,
          departureM3: t.departureM3,
          departureM3Corrected: t.departureM3Corrected,
          arrivalM3: t.arrivalM3,
          arrivalM3Corrected: t.arrivalM3Corrected,
          deviationM3: t.deviationM3,
          material: t.material?.materialType ?? null, 
          abscisa: t.abscisa ?? null,
          vehicle: t.vehicle,
          constSite: t.constSite,
          planning: t.planning
            ? { id: t.planning.id, planningCode: t.planning.planningCode }
            : null,
          client: t.client,
        })),
      };

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en getMaterialByConstSite: ${errorMessage}`);
      throw error;
    }
  }

  async getMaterialProviders() {
    const providers = await this.prisma.materialProvider.findMany({
      where: { isActive: true },
      include: { canteras: { select: { id: true, nombre: true } } },
      orderBy: { razonsocial: 'asc' },
    });
    return { success: true, providers };
  }

  async getMaterialProviderReport(params: {
    providerId?: number;
    canteraId?: number;
    factura?: string;
    startDate: string;
    endDate: string;
  }) {
    try {
      const { providerId, canteraId, factura, startDate, endDate } = params;
      const { start, end } = this.parseDateRangeUTC(startDate, endDate);

      if (start > end) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser mayor a la fecha de fin',
        );
      }

      const emptyResponse = {
        success: true,
        period: { startDate: start, endDate: end },
        summary: {
          totalMovements: 0,
          totalDepartureM3: 0,
          totalArrivalM3: 0,
          deviation: 0,
        },
        movements: [],
      };

      let planningIds: number[] | undefined;

      if (canteraId || providerId) {
        const canteras = await this.prisma.cantera.findMany({
          where: {
            ...(canteraId ? { id: canteraId } : {}),
            ...(providerId ? { materialProviderId: providerId } : {}),
          },
          select: { id: true },
        });

        if (canteras.length === 0) return emptyResponse;

        const cIds = canteras.map((c) => c.id);
        const planningCanteras = await this.prisma.planningCantera.findMany({
          where: { canteraId: { in: cIds } },
          select: { planningId: true },
        });

        planningIds = [...new Set(planningCanteras.map((pc) => pc.planningId))];
        if (planningIds.length === 0) return emptyResponse;
      }

      const whereClause: any = {
        departureAt: { gte: start, lte: end },
        planningId: planningIds !== undefined
          ? { in: planningIds }
          : { not: null },
      };

      if (factura) {
        whereClause.OR = [
          { numeroFactura: { contains: factura, mode: 'insensitive' } },
          {
            planning: {
              is: { numeroFactura: { contains: factura, mode: 'insensitive' } },
            },
          },
        ];
      }

      const transports = flattenTrips(await this.prisma.transportTrip.findMany({
        where: whereClause,
        include: {
          vehicle: {
            select: {
              id: true,
              vehicleid: true,
              plate: true,
              brand: true,
              model: true,
              type: true,
              owner: { select: { id: true, name: true, companyname: true } },
            },
          },
          owner: { select: { id: true, name: true, companyname: true } },
          planning: {
            select: {
              id: true,
              planningCode: true,
              numeroFactura: true,
              canteras: {
                include: {
                  cantera: {
                    select: {
                      id: true,
                      nombre: true,
                      materialProvider: {
                        select: { id: true, razonsocial: true },
                      },
                    },
                  },
                },
              },
            },
          },
          constSite: { select: { id: true, name: true } },
          departure: true,
          arrival: true,
        },
        orderBy: { departureAt: 'desc' },
      }));

      const totalDepartureM3 = transports.reduce(
        (sum, t) => sum + (t.departureM3Corrected ?? t.departureM3 ?? 0),
        0,
      );
      const totalArrivalM3 = transports.reduce(
        (sum, t) => sum + (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0),
        0,
      );

      return {
        success: true,
        period: { startDate: start, endDate: end },
        summary: {
          totalMovements: transports.length,
          totalDepartureM3: Number(totalDepartureM3.toFixed(2)),
          totalArrivalM3: Number(totalArrivalM3.toFixed(2)),
          deviation: Number((totalDepartureM3 - totalArrivalM3).toFixed(2)),
        },
        movements: transports.map((t) => ({
          id: t.id,
          numeroFactura: t.numeroFactura ?? t.planning?.numeroFactura ?? null,
          status: t.status,
          departureAt: t.departureAt,
          arrivalAt: t.arrivalAt,
          departureM3: t.departureM3,
          departureM3Corrected: t.departureM3Corrected,
          arrivalM3: t.arrivalM3,
          arrivalM3Corrected: t.arrivalM3Corrected,
          deviationM3: t.deviationM3,
          vehicle: t.vehicle,
          owner:
            t.owner ??
            (t.vehicle.owner
              ? {
                  id: t.vehicle.owner.id,
                  name: t.vehicle.owner.name,
                  companyname: t.vehicle.owner.companyname,
                }
              : null),
          planning: t.planning
            ? {
                id: t.planning.id,
                planningCode: t.planning.planningCode,
                canteras: t.planning.canteras.map((pc) => ({
                  id: pc.cantera.id,
                  nombre: pc.cantera.nombre,
                  proveedor: pc.cantera.materialProvider?.razonsocial ?? null,
                })),
              }
            : null,
          constSite: t.constSite,
        })),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en getMaterialProviderReport: ${errorMessage}`);
      throw error;
    }
  }

  async getMaterialByPlanning(
    planningId: number,
    startDate: string,
    endDate: string,
  ) {
    try {
      const planning = await this.prisma.planning.findUnique({
        where: { id: planningId },
        include: {
          client: { select: { id: true, name: true, companyname: true } },
          constSite: { select: { id: true, name: true } },
        },
      });

      if (!planning) {
        throw new NotFoundException(
          `Planificación con ID ${planningId} no encontrada`,
        );
      }

      const { start, end } = this.parseDateRangeUTC(startDate, endDate);

      if (start > end) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser mayor a la fecha de fin',
        );
      }

      const transports = flattenTrips(await this.prisma.transportTrip.findMany({
        where: {
          planningId,
          arrivalAt: { not: null },
          departureAt: { gte: start, lte: end },
        },
        include: {
          vehicle: {
            select: {
              vehicleid: true,
              plate: true,
              brand: true,
              model: true,
              type: true,
              owner: { select: { id: true, name: true, companyname: true } },
            },
          },
          owner: { select: { id: true, name: true, companyname: true } },
          material: { select: { id: true, materialType: true } }, 
          departure: true,
          arrival: true,
        },
        orderBy: { arrivalAt: 'desc' },
      }));

      const totalArrivalM3 = transports.reduce(
        (sum, t) => sum + (t.arrivalM3Corrected ?? t.arrivalM3 ?? 0),
        0,
      );
      const totalDepartureM3 = transports.reduce(
        (sum, t) => sum + (t.departureM3Corrected ?? t.departureM3 ?? 0),
        0,
      );
      const uniqueVehicles = new Set(transports.map((t) => t.vehicleId)).size;
      const uniqueOwners = new Set(transports.map((t) => t.ownerId)).size;

      const m3ByMaterial: Record<string, number> = {};
      transports.forEach((t) => {
        const tipo = t.material?.materialType ?? 'SIN_MATERIAL';
        const m3 = t.arrivalM3Corrected ?? t.arrivalM3 ?? 0;
        m3ByMaterial[tipo] = (m3ByMaterial[tipo] ?? 0) + m3;
      });

      return {
        success: true,
        planning: {
          id: planning.id,
          planningCode: planning.planningCode,
          description: planning.description,
          status: planning.status,
          startDate: planning.startDate,
          endDate: planning.endDate,
          client: planning.client,
          constSite: planning.constSite,
        },
        period: { startDate: start, endDate: end },
        summary: {
          totalDeliveries: transports.length,
          totalM3Delivered: Number(totalArrivalM3.toFixed(2)),
          totalM3Departed: Number(totalDepartureM3.toFixed(2)),
          deviation: Number((totalDepartureM3 - totalArrivalM3).toFixed(2)),
          uniqueVehicles,
          uniqueOwners,
          m3ByMaterial: Object.fromEntries(
            Object.entries(m3ByMaterial).map(([k, v]) => [
              k,
              Number(v.toFixed(2)),
            ]),
          ),
        },
        deliveries: transports.map((t) => ({
          id: t.id,
          status: t.status,
          departureAt: t.departureAt,
          arrivalAt: t.arrivalAt,
          departureM3: t.departureM3,
          departureM3Corrected: t.departureM3Corrected,
          arrivalM3: t.arrivalM3,
          arrivalM3Corrected: t.arrivalM3Corrected,
          deviationM3: t.deviationM3,
          material: t.material?.materialType ?? null,
          vehicle: t.vehicle,
          owner: t.owner,
        })),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error en getMaterialByPlanning: ${errorMessage}`);
      throw error;
    }
  }
}