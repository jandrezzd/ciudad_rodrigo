import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import * as fs from 'fs';
import * as path from 'path';
import { flattenTrip, flattenTrips, TRIP_FULL_INCLUDE } from './flatten-trip';
import { BusinessException } from '../common/business.exception';

@Injectable()
export class TransportLogService {
  private readonly logger = new Logger(TransportLogService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads/transport');

  constructor(
    private prisma: PrismaService,
    private dashboardService: DashboardService,
  ) {
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Directorio de uploads creado: ${this.uploadDir}`);
    }
  }

  async getByQrCode(qrcodeValue: string, userId: number) {
    try {
      const qrcodeRecord = await this.prisma.vehicleQRCode.findUnique({
        where: { qrcode: qrcodeValue },
      });

      if (!qrcodeRecord) {
        throw new NotFoundException(`NO SE RECONOCE EL CÓDIGO ${qrcodeValue}`);
      }

      const vehicle = await this.prisma.vehicle.findUnique({
        include: { driver: true, owner: true },
        where: { qrcodeId: qrcodeRecord.id },
      });

      if (!vehicle) {
        throw new NotFoundException(`EL VEHICULO NO TRABAJA PARA LA COMPAÑÍA`);
      }

      if (!vehicle.isActive) {
        throw new BadRequestException('EL VEHICULO ESTA INACTIVO');
      }

      // Compatibilidad temporal con el frontend/app actuales (deciden la pantalla
      // según action: CREATE_DEPARTURE/CONTINUE_TO_ARRIVAL). Con varias vueltas
      // simultáneas del mismo vehículo (offline) puede haber más de una EN_PROGRESO;
      // se toma la más ANTIGUA (mismo criterio FIFO que usará el emparejamiento
      // automático del punto 1.4). Este shim se retira cuando el punto 2.5
      // (decisión de pantalla por rol de usuario) esté implementado.
      const activeTransport = await this.prisma.transportTrip.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: 'EN_PROGRESO' as any,
        },
        include: TRIP_FULL_INCLUDE,
        orderBy: { departureAt: 'asc' },
      });

      if (activeTransport) {
        return {
          action: 'CONTINUE_TO_ARRIVAL',
          transportId: activeTransport.id,
          data: flattenTrip(activeTransport),
        };
      }

      return {
        action: 'CREATE_DEPARTURE',
        vehicle: {
          id: vehicle.id,
          vehicleid: vehicle.vehicleid,
          plate: vehicle.plate,
          type: vehicle.type,
          company: vehicle.company,
          brand: vehicle.brand,
          model: vehicle.model,
          driverId: vehicle.driverId,
          capacity: vehicle.capacity,
          owner: vehicle.owner,
          driver: vehicle.driver,
        },
      };
    } catch (error) {
      this.logger.error(`Error en getByQrCode: ${error.message}`);
      throw error;
    }
  }

  async createDeparture(userId: number, data: any, files: any) {
    return this.submitDeparture(userId, data, files);
  }

  async submitDeparture(userId: number, data: any, files: any) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException(`EL USUARIO NO EXISTE`);
      }

      if (user.role === 'SUPERVISOR') {
        throw new BadRequestException('USTED NO ES UN SUPERVISOR');
      }
      const userRoleType =
        user.role === 'ADMIN' ? 'ADMIN' : user.roletype || 'CANTERA';

      const vehicleId = parseInt(data.vehicleId);
      const departureLat = parseFloat(data.departureLat);
      const departureLng = parseFloat(data.departureLng);
      const departureM3 = parseFloat(data.departureM3);
      const planningId = data.planningId ? parseInt(data.planningId) : null;
      const materialId = data.materialId ? parseInt(data.materialId) : null;
      const uuid = data.uuid || data.clientUuid;

      if (
        isNaN(vehicleId) ||
        isNaN(departureLat) ||
        isNaN(departureLng) ||
        isNaN(departureM3)
      ) {
        throw new BadRequestException('DATOS DE SALIDA INVÁLIDOS');
      }

      const vehicle = await this.prisma.vehicle.findUnique({
        include: { qrcode: true },
        where: { id: vehicleId },
      });

      if (!vehicle || !vehicle.isActive) {
        throw new BadRequestException('EL VEHICULO NO EXISTE O ESTA INACTIVO');
      }

      if (vehicle.ownerId) {
        const owner = await this.prisma.owner.findUnique({
          where: { id: vehicle.ownerId },
        });
        if (!owner || !owner.isActive) {
          throw new BadRequestException(
            'EL PROPIETARIO DEL VEHICULO ESTA INACTIVO',
          );
        }
      } else if (!vehicle.company) {
        throw new BadRequestException(
          'EL VEHICULO NO TIENE PROPIETARIO O COMPAÑÍA ASIGNADA',
        );
      }

      if (materialId) {
        const material = await this.prisma.material.findUnique({
          where: { id: materialId },
        });
        if (!material) {
          throw new NotFoundException(`EL MATERIAL NO EXISTE`);
        }
      }

      let clientId: number;
      let constSiteId: number;
      let resolvedPlanningId = planningId;

      if (!resolvedPlanningId) {
        const pv = await this.prisma.planningVehicle.findFirst({
          where: { vehicleId },
        });
        if (pv) resolvedPlanningId = pv.planningId;
      }

      if (resolvedPlanningId) {
        const planning = await this.prisma.planning.findUnique({
          where: { id: resolvedPlanningId },
          include: { vehicles: true },
        });
        if (!planning) throw new NotFoundException('LA PLANIFICACIÓN NO EXISTE');

        clientId = planning.clientId;
        constSiteId = planning.constSiteId;
      } else {
        if (!data.clientId || !data.constSiteId) {
          throw new BadRequestException('FALTA EL CLIENTE O LA OBRA');
        }
        clientId = parseInt(data.clientId);
        constSiteId = parseInt(data.constSiteId);
      }

      if (!files?.material || files.material.length < 1) {
        throw new BadRequestException('FALTA FOTO DEL MATERIAL DE SALIDA');
      }

      const capturedAt = data.capturedAt ? new Date(data.capturedAt) : new Date();

      // Idempotencia: si ya llegó este mismo envío (offline/reintento), devolver el existente
      if (uuid) {
        const existingDeparture = await this.prisma.transportDeparture.findUnique({
          where: { clientUuid: uuid },
          include: { trip: { include: TRIP_FULL_INCLUDE } },
        });
        if (existingDeparture) {
          return { success: true, data: flattenTrip(existingDeparture.trip) };
        }
      }

      const photos: any = {
        materialPhoto1: files.material?.[0]
          ? this.getRelativePath(files.material[0].path)
          : null,
        materialPhoto2: files.material?.[1]
          ? this.getRelativePath(files.material[1].path)
          : null,
      };

      if (files.driver?.[0])
        photos.driverPhoto = this.getRelativePath(files.driver[0].path);
      if (files.vehicle?.[0])
        photos.vehiclePhoto = this.getRelativePath(files.vehicle[0].path);
      if (files.plate?.[0])
        photos.platePhoto = this.getRelativePath(files.plate[0].path);

      const clientUuid =
        uuid ||
        (await this.prisma.$queryRaw<{ uuid: string }[]>`SELECT gen_random_uuid() as uuid`)[0].uuid;

      const transport = await this.prisma.transportTrip.create({
        data: {
          uuid: clientUuid,
          user: { connect: { id: userId } },
          vehicle: { connect: { id: vehicleId } },
          client: { connect: { id: clientId } },
          constSite: { connect: { id: constSiteId } },
          ...(vehicle.ownerId && {
            owner: { connect: { id: vehicle.ownerId } },
          }),
          ...(resolvedPlanningId && {
            planning: { connect: { id: resolvedPlanningId } },
          }),
          ...(materialId && { material: { connect: { id: materialId } } }),
          userRoleType: userRoleType as any,
          status: 'EN_PROGRESO' as any,
          departureAt: capturedAt,
          departure: {
            create: {
              clientUuid,
              source: (data.source as any) || 'ONLINE',
              capturedAt,
              userId,
              m3: departureM3,
              lat: departureLat,
              lng: departureLng,
              ...photos,
            },
          },
        },
        include: TRIP_FULL_INCLUDE,
      });

      if (vehicle.qrcode) {
        await this.prisma.vehicleQRCode.update({
          where: { id: vehicle.qrcode.id },
          data: { status: 'OCUPADO' as any },
        });
        this.logger.log(`QR ${vehicle.qrcode.qrcode} marcado como OCUPADO`);
      }

      await this.dashboardService.incrementDepartureCount(capturedAt);
      return { success: true, data: flattenTrip(transport) };
    } catch (error) {
      this.cleanupFiles(files);
      throw error;
    }
  }

  async registerArrivalLegacy(
    id: number,
    data: any,
    files: any,
    userArrivalId: number,
  ) {
    return this.submitArrivalLegacy(id, data, files, userArrivalId);
  }

  async submitArrivalLegacy(
    id: number,
    data: any,
    files: any,
    userArrivalId: number,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userArrivalId },
      });
      if (!user) throw new NotFoundException('USUARIO NO ENCONTRADO');

      const userRoleType =
        user.role === 'ADMIN' ? 'ADMIN' : user.roletype || 'OBRA';

      if (!files?.material || files.material.length < 1) {
        throw new BadRequestException('FALTA FOTO DEL MATERIAL DE LLEGADA');
      }

      const photos: any = {
        materialPhoto1: files.material?.[0]
          ? this.getRelativePath(files.material[0].path)
          : null,
        materialPhoto2: files.material?.[1]
          ? this.getRelativePath(files.material[1].path)
          : null,
      };

      if (files.driver?.[0])
        photos.driverPhoto = this.getRelativePath(files.driver[0].path);
      if (files.vehicle?.[0])
        photos.vehiclePhoto = this.getRelativePath(files.vehicle[0].path);
      if (files.plate?.[0])
        photos.platePhoto = this.getRelativePath(files.plate[0].path);

      const arrivalLat = parseFloat(data.arrivalLat);
      const arrivalLng = parseFloat(data.arrivalLng);
      const arrivalM3 = parseFloat(data.arrivalM3);

      if (isNaN(arrivalLat) || isNaN(arrivalLng) || isNaN(arrivalM3)) {
        throw new BadRequestException('DATOS DE LLEGADA INVÁLIDOS');
      }

      const capturedAt = data.capturedAt ? new Date(data.capturedAt) : new Date();

      const updated = await this.prisma.$transaction(async (prisma) => {
        const transport = await prisma.transportTrip.findUnique({
          where: { id },
          include: {
            vehicle: { include: { qrcode: true } },
            departure: true,
            arrival: true,
          },
        });

        if (!transport) {
          throw new BadRequestException('EL TRANSPORTE NO EXISTE');
        }

        // Idempotencia: si ya tiene llegada, devolver el registro existente
        if (transport.arrival) {
          return prisma.transportTrip.findUnique({
            where: { id },
            include: TRIP_FULL_INCLUDE,
          });
        }

        if (transport.status !== 'EN_PROGRESO') {
          throw new BadRequestException(
            'EL TRANSPORTE NO EXISTE O YA FUE COMPLETADO',
          );
        }

        const departureM3Effective = data.departureM3Corrected
          ? parseFloat(data.departureM3Corrected)
          : transport.departure!.m3;

        const deviationM3 = arrivalM3 - departureM3Effective;
        const finalStatus =
          Math.abs(deviationM3) >= 1 ? 'ALERTA' : 'COMPLETADO';

        const clientUuid = data.uuid || transport.uuid;

        const updatedHeader = await prisma.transportTrip.update({
          where: { id },
          data: {
            arrivalAt: capturedAt,
            deviationM3,
            userArrivalId,
            userRoleType: userRoleType as any,
            status: finalStatus as any,
            initialStatus: finalStatus as any,
            departure: data.departureM3Corrected
              ? { update: { m3Corrected: parseFloat(data.departureM3Corrected) } }
              : undefined,
            arrival: {
              create: {
                clientUuid,
                source: (data.source as any) || 'ONLINE',
                capturedAt,
                userId: userArrivalId,
                m3: arrivalM3,
                m3Corrected: data.arrivalM3Corrected
                  ? parseFloat(data.arrivalM3Corrected)
                  : null,
                lat: arrivalLat,
                lng: arrivalLng,
                abscisa: data.abscisa ? parseInt(data.abscisa) : null,
                ...photos,
              },
            },
          },
          include: TRIP_FULL_INCLUDE,
        });

        if (transport.vehicle?.qrcode) {
          await prisma.vehicleQRCode.update({
            where: { id: transport.vehicle.qrcode.id },
            data: { status: 'DISPONIBLE' as any },
          });
          this.logger.log(
            `QR ${transport.vehicle.qrcode.qrcode} marcado como DISPONIBLE`,
          );
        }

        return updatedHeader;
      });

      if (!updated) {
        throw new BadRequestException('EL TRANSPORTE NO EXISTE');
      }

      await this.dashboardService.incrementArrivalCount(capturedAt);

      this.logger.log(
        `Llegada registrada con éxito | ID: ${updated.id} | Status: ${updated.status}`,
      );

      return {
        success: true,
        message: 'Llegada registrada',
        data: flattenTrip(updated),
      };
    } catch (error) {
      this.cleanupFiles(files);
      this.logger.error(`Error en registerArrival: ${error.message}`);
      throw error;
    }
  }

  async submitArrival(
    data: any,
    files: any,
    userArrivalId: number,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userArrivalId },
      });
      if (!user) throw new BusinessException('USER_NOT_FOUND', 'USUARIO NO ENCONTRADO', false, 404);

      const userRoleType =
        user.role === 'ADMIN' ? 'ADMIN' : user.roletype || 'OBRA';

      if (!files?.material || files.material.length < 1) {
        throw new BusinessException('MISSING_MATERIAL_PHOTO', 'FALTA FOTO DEL MATERIAL DE LLEGADA', false, 400);
      }

      const clientUuid = data.uuid;
      if (!clientUuid) {
        throw new BusinessException('VALIDATION_ERROR', 'uuid es requerido', false, 400);
      }

      // Idempotencia
      const existingArrival = await this.prisma.transportArrival.findUnique({
        where: { clientUuid },
        include: { trip: { include: TRIP_FULL_INCLUDE } },
      });
      
      if (existingArrival) {
        this.cleanupFiles(files);
        return { success: true, idempotentReplay: true, data: flattenTrip(existingArrival.trip) };
      }

      const qrcode = data.qrcode;
      if (!qrcode) {
        throw new BusinessException('VALIDATION_ERROR', 'qrcode es requerido', false, 400);
      }

      const vehicleQRCode = await this.prisma.vehicleQRCode.findUnique({
        where: { qrcode },
        include: { vehicle: true },
      });

      if (!vehicleQRCode || !vehicleQRCode.vehicle) {
         throw new BusinessException('VEHICLE_NOT_FOUND', 'EL VEHICULO NO EXISTE', false, 404);
      }

      const vehicleId = vehicleQRCode.vehicle.id;

      const photos: any = {
        materialPhoto1: files.material?.[0]
          ? this.getRelativePath(files.material[0].path)
          : null,
        materialPhoto2: files.material?.[1]
          ? this.getRelativePath(files.material[1].path)
          : null,
      };

      if (files.driver?.[0])
        photos.driverPhoto = this.getRelativePath(files.driver[0].path);
      if (files.vehicle?.[0])
        photos.vehiclePhoto = this.getRelativePath(files.vehicle[0].path);
      if (files.plate?.[0])
        photos.platePhoto = this.getRelativePath(files.plate[0].path);

      const arrivalLat = parseFloat(data.arrivalLat);
      const arrivalLng = parseFloat(data.arrivalLng);
      const arrivalM3 = parseFloat(data.arrivalM3);

      if (isNaN(arrivalLat) || isNaN(arrivalLng) || isNaN(arrivalM3)) {
        throw new BusinessException('VALIDATION_ERROR', 'DATOS DE LLEGADA INVÁLIDOS', false, 400);
      }

      const capturedAt = data.capturedAt ? new Date(data.capturedAt) : new Date();

      const updated = await this.prisma.$transaction(async (prisma) => {
        // Encontrar la salida EN_PROGRESO más antigua de este vehículo con departureAt <= capturedAt
        const claimResult = await prisma.$queryRaw<{id: number}[]>`
          SELECT id FROM "TransportTrip"
          WHERE "vehicleId" = ${vehicleId}
            AND status = 'EN_PROGRESO'
            AND "departureAt" <= ${capturedAt}
          ORDER BY "departureAt" ASC
          LIMIT 1
          FOR UPDATE
        `;

        if (claimResult.length === 0) {
           throw new BusinessException('NO_OPEN_DEPARTURE', 'NO SE ENCONTRO UNA SALIDA ABIERTA', true, 409);
        }

        const id = claimResult[0].id;

        const transport = await prisma.transportTrip.findUnique({
          where: { id },
          include: {
            vehicle: { include: { qrcode: true } },
            departure: true,
            arrival: true,
          },
        });

        if (!transport) {
          throw new BusinessException('INTERNAL_ERROR', 'Error interno resolviendo el viaje', true, 500);
        }

        const departureM3Effective = data.departureM3Corrected
          ? parseFloat(data.departureM3Corrected)
          : transport.departure!.m3;

        const deviationM3 = arrivalM3 - departureM3Effective;
        const finalStatus =
          Math.abs(deviationM3) >= 1 ? 'ALERTA' : 'COMPLETADO';

        const updatedHeader = await prisma.transportTrip.update({
          where: { id },
          data: {
            arrivalAt: capturedAt,
            deviationM3,
            userArrivalId,
            userRoleType: userRoleType as any,
            status: finalStatus as any,
            initialStatus: finalStatus as any,
            departure: data.departureM3Corrected
              ? { update: { m3Corrected: parseFloat(data.departureM3Corrected) } }
              : undefined,
            arrival: {
              create: {
                clientUuid,
                source: (data.source as any) || 'ONLINE',
                capturedAt,
                userId: userArrivalId,
                m3: arrivalM3,
                m3Corrected: data.arrivalM3Corrected
                  ? parseFloat(data.arrivalM3Corrected)
                  : null,
                lat: arrivalLat,
                lng: arrivalLng,
                abscisa: data.abscisa ? parseInt(data.abscisa) : null,
                ...photos,
              },
            },
          },
          include: TRIP_FULL_INCLUDE,
        });

        if (transport.vehicle?.qrcode) {
          await prisma.vehicleQRCode.update({
            where: { id: transport.vehicle.qrcode.id },
            data: { status: 'DISPONIBLE' as any },
          });
          this.logger.log(
            `QR ${transport.vehicle.qrcode.qrcode} marcado como DISPONIBLE`,
          );
        }

        return updatedHeader;
      });

      await this.dashboardService.incrementArrivalCount(capturedAt);

      this.logger.log(
        `Llegada registrada con éxito (AUTO-MATCH) | ID: ${updated.id} | Status: ${updated.status}`,
      );

      return {
        success: true,
        message: 'Llegada registrada',
        data: flattenTrip(updated),
      };
    } catch (error) {
      this.cleanupFiles(files);
      this.logger.error(`Error en submitArrival: ${error.message}`);
      throw error;
    }
  }

  async findAll(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`EL USUARIO NO EXISTE`);
    }

    if (user.role === 'ADMIN' || user.role === 'JEFE_DE_OBRA') {
      const rows = await this.prisma.transportTrip.findMany({
        include: TRIP_FULL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
      return flattenTrips(rows);
    }

    const rows = await this.prisma.transportTrip.findMany({
      where: {
        OR: [{ userId }, { userArrivalId: userId }],
      },
      include: TRIP_FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return flattenTrips(rows);
  }

  async findAllByUserId(userId: number) {
    const rows = await this.prisma.transportTrip.findMany({
      where: {
        OR: [{ userId }, { userArrivalId: userId }],
      },
      include: TRIP_FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return flattenTrips(rows);
  }

  async findAllByUserIdWithFilters(
    userId: number,
    vehicleId?: number,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = {
      OR: [{ userId }, { userArrivalId: userId }],
    };

    if (vehicleId) {
      where.vehicleId = vehicleId;
    }

    if (startDate || endDate) {
      where.departureAt = {};

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.departureAt.gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.departureAt.lte = end;
      }
    }

    const rows = await this.prisma.transportTrip.findMany({
      where,
      include: TRIP_FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return flattenTrips(rows);
  }

  async getUniqueVehiclesByUserId(userId: number) {
    const transports = await this.prisma.transportTrip.findMany({
      where: {
        OR: [{ userId }, { userArrivalId: userId }],
      },
      include: { vehicle: true },
    });

    const uniqueVehicles = new Map();
    transports.forEach((transport) => {
      if (transport.vehicle && !uniqueVehicles.has(transport.vehicle.id)) {
        uniqueVehicles.set(transport.vehicle.id, transport.vehicle);
      }
    });

    return Array.from(uniqueVehicles.values());
  }

  async findOne(id: number) {
    const transport = await this.prisma.transportTrip.findUnique({
      where: { id },
      include: TRIP_FULL_INCLUDE,
    });
    if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');
    return flattenTrip(transport);
  }

  async correctMaterial(
    id: number,
    data: { departureM3Corrected?: number; arrivalM3Corrected?: number },
    userId: number,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('EL USUARIO NO EXISTE');

      const transport = await this.prisma.transportTrip.findUnique({
        where: { id },
        include: { departure: true, arrival: true },
      });
      if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');

      if (!transport.arrival) {
        throw new BadRequestException(
          'NO SE PUEDE CORREGIR LA DESVIACIÓN: EL VIAJE NO TIENE LLEGADA REGISTRADA (TRIP_NOT_CLOSED)',
        );
      }

      // Solo JEFE_DE_OBRA tiene restricción de solo editar en ALERTA
      if (user.role === 'JEFE_DE_OBRA' && transport.status !== 'ALERTA') {
        throw new BadRequestException(
          `SOLO SE PUEDEN EDITAR LOS M3 CUANDO EL ESTADO ES ALERTA.`,
        );
      }

      const dM3 =
        data.departureM3Corrected ??
        transport.departure!.m3Corrected ??
        transport.departure!.m3;
      const aM3 =
        data.arrivalM3Corrected ??
        transport.arrival.m3Corrected ??
        transport.arrival.m3;
      const deviationM3 = aM3 - dM3;

      // Determinar el estado según el rol del usuario
      const finalStatus = user.role === 'ADMIN' ? 'REVISADO' : 'VALIDADO';

      const updated = await this.prisma.$transaction(async (prisma) => {
        if (data.departureM3Corrected !== undefined) {
          await prisma.transportDeparture.update({
            where: { tripId: id },
            data: { m3Corrected: data.departureM3Corrected },
          });
        }
        if (data.arrivalM3Corrected !== undefined) {
          await prisma.transportArrival.update({
            where: { tripId: id },
            data: { m3Corrected: data.arrivalM3Corrected },
          });
        }

        return prisma.transportTrip.update({
          where: { id },
          data: {
            deviationM3,
            status: finalStatus as any,
          },
          include: TRIP_FULL_INCLUDE,
        });
      });

      return { success: true, data: flattenTrip(updated) };
    } catch (error) {
      throw error;
    }
  }

  async markAsAlert(id: number) {
    try {
      const transport = await this.prisma.transportTrip.findUnique({
        where: { id },
      });
      if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');

      const updated = await this.prisma.transportTrip.update({
        where: { id },
        data: {
          status: 'ALERTA' as any,
          initialStatus: 'ALERTA' as any,
        },
        include: TRIP_FULL_INCLUDE,
      });

      this.logger.log(
        `Registro ${id} marcado como ALERTA con initialStatus actualizado`,
      );
      return { success: true, data: flattenTrip(updated) };
    } catch (error) {
      throw error;
    }
  }

  async updateTransportStatus(id: number, newStatus: string) {
    try {
      const transport = await this.prisma.transportTrip.findUnique({
        where: { id },
      });
      if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');

      const allowedOrigins = ['COMPLETADO', 'VALIDADO', 'ALERTA'];
      if (
        newStatus === 'REVISADO' &&
        !allowedOrigins.includes(transport.status as string)
      ) {
        throw new BadRequestException(
          `NO SE PUEDE CAMBIAR A EL ESTADO REVISADO DESDE ${transport.status}.`,
        );
      }

      const updated = await this.prisma.transportTrip.update({
        where: { id },
        data: {
          status: newStatus as any,
        },
        include: TRIP_FULL_INCLUDE,
      });

      this.logger.log(
        `Registro ${id} cambio de ${transport.status} a ${newStatus}`,
      );
      return { success: true, data: flattenTrip(updated) };
    } catch (error) {
      throw error;
    }
  }

  private cleanupFiles(files: any) {
    if (!files) return;
    const fields = ['driver', 'vehicle', 'plate', 'material'];
    fields.forEach((f) => {
      if (Array.isArray(files[f])) {
        files[f].forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {}
        });
      }
    });
  }

  private getRelativePath(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  }
}
