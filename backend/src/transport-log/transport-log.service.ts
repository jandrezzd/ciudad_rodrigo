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
import { randomUUID } from 'crypto';
import { flattenTrip, flattenTrips, TRIP_FULL_INCLUDE } from './flatten-trip';
import { BusinessException } from '../common/business.exception';
import { CanteraStockService } from './cantera-stock.service';

@Injectable()
export class TransportLogService {
  private readonly logger = new Logger(TransportLogService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads/transport');

  constructor(
    private prisma: PrismaService,
    private dashboardService: DashboardService,
    private canteraStockService: CanteraStockService,
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
    } catch (error: any) {
      this.logger.error(`Error en getByQrCode: ${error.message}`);
      throw error;
    }
  }

  async createDeparture(userId: number, data: any, files: any) {
    return this.submitDeparture(userId, data, files);
  }

  async submitDeparture(userId: number, data: any, files: any) {
    try {
      // --- Identidad del envío (idempotencia) y hora real ---
      const uuid = data.uuid || data.clientUuid || randomUUID();
      if (!data.uuid && !data.clientUuid) {
        this.logger.warn('legacy client: POST /transport/departure sin uuid');
      }

      const capturedAt = data.capturedAt
        ? new Date(data.capturedAt)
        : new Date();
      this.validateCapturedAt(capturedAt);
      if (!data.capturedAt) {
        this.logger.warn(
          'legacy client: POST /transport/departure sin capturedAt',
        );
      }

      // --- Replay idempotente (paso 1 del plan 1.5): sin tocar QR ni DailyStats ---
      if (uuid) {
        const existingDeparture =
          await this.prisma.transportDeparture.findUnique({
            where: { clientUuid: uuid },
            include: { trip: { include: TRIP_FULL_INCLUDE } },
          });
        if (existingDeparture) {
          this.cleanupFiles(files);
          return {
            success: true,
            idempotentReplay: true,
            data: flattenTrip(existingDeparture.trip),
          };
        }
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new BusinessException(
          'USER_NOT_FOUND',
          'EL USUARIO NO EXISTE',
          false,
          404,
        );
      }

      if (user.role === 'SUPERVISOR') {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'USTED NO ES UN SUPERVISOR',
          false,
          400,
        );
      }
      const userRoleType =
        user.role === 'ADMIN' ? 'ADMIN' : user.roletype || 'CANTERA';

      // --- Resolver vehículo: por vehicleId o por qrcode (alternativa offline) ---
      let vehicleId = data.vehicleId ? parseInt(data.vehicleId) : NaN;
      if (isNaN(vehicleId) && data.qrcode) {
        const qrcodeRecord = await this.prisma.vehicleQRCode.findUnique({
          where: { qrcode: data.qrcode },
          include: { vehicle: true },
        });
        if (!qrcodeRecord?.vehicle) {
          throw new BusinessException(
            'QR_NOT_FOUND',
            'NO SE RECONOCE EL CODIGO QR',
            false,
            404,
          );
        }
        vehicleId = qrcodeRecord.vehicle.id;
      }
      if (isNaN(vehicleId)) {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'vehicleId o qrcode es requerido',
          false,
          400,
        );
      }

      const departureLat = parseFloat(data.departureLat);
      const departureLng = parseFloat(data.departureLng);
      const departureM3 = parseFloat(data.departureM3);
      const planningId = data.planningId ? parseInt(data.planningId) : null;
      const materialId = data.materialId ? parseInt(data.materialId) : null;
      const canteraIdExplicita = data.canteraId ? parseInt(data.canteraId) : null;

      if (isNaN(departureLat) || isNaN(departureLng) || isNaN(departureM3)) {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'DATOS DE SALIDA INVÁLIDOS',
          false,
          400,
        );
      }

      const vehicle = await this.prisma.vehicle.findUnique({
        include: { qrcode: true },
        where: { id: vehicleId },
      });

      if (!vehicle) {
        throw new BusinessException(
          'VEHICLE_NOT_FOUND',
          'EL VEHICULO NO EXISTE',
          false,
          404,
        );
      }

      if (!vehicle.isActive) {
        throw new BusinessException(
          'VEHICLE_INACTIVE',
          'EL VEHICULO ESTA INACTIVO',
          false,
          422,
        );
      }

      if (vehicle.ownerId) {
        const owner = await this.prisma.owner.findUnique({
          where: { id: vehicle.ownerId },
        });
        if (!owner || !owner.isActive) {
          throw new BusinessException(
            'OWNER_INACTIVE',
            'EL PROPIETARIO DEL VEHICULO ESTA INACTIVO',
            false,
            422,
          );
        }
      } else if (!vehicle.company) {
        throw new BusinessException(
          'VEHICLE_WITHOUT_OWNER_OR_COMPANY',
          'EL VEHICULO NO TIENE PROPIETARIO O COMPAÑÍA ASIGNADA',
          false,
          422,
        );
      }

      if (materialId) {
        const material = await this.prisma.material.findUnique({
          where: { id: materialId },
        });
        if (!material) {
          throw new BusinessException(
            'MATERIAL_NOT_FOUND',
            'EL MATERIAL NO EXISTE',
            false,
            404,
          );
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
        if (!planning) {
          throw new BusinessException(
            'PLANNING_NOT_FOUND',
            'LA PLANIFICACIÓN NO EXISTE',
            false,
            404,
          );
        }

        clientId = planning.clientId;
        constSiteId = planning.constSiteId;
      } else {
        if (!data.clientId || !data.constSiteId) {
          throw new BusinessException(
            'VALIDATION_ERROR',
            'FALTA EL CLIENTE O LA OBRA',
            false,
            400,
          );
        }
        clientId = parseInt(data.clientId);
        constSiteId = parseInt(data.constSiteId);
      }

      if (!files?.material || files.material.length < 1) {
        throw new BusinessException(
          'MISSING_MATERIAL_PHOTO',
          'FALTA FOTO DEL MATERIAL DE SALIDA',
          false,
          400,
        );
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

      const source = (data.source as string) || 'ONLINE';

      // De qué cantera sale el material: la enviada, la del vehículo en su
      // planificación, o la única de la planificación si hay una sola.
      const canteraId = await this.canteraStockService.resolverCantera({
        canteraIdExplicita,
        planningId: resolvedPlanningId,
        vehicleId,
      });

      // --- Insert + giro de QR a OCUPADO dentro de la MISMA transacción ---
      const transport = await this.prisma.$transaction(async (prisma) => {
        const trip = await prisma.transportTrip.create({
          data: {
            uuid,
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
            ...(canteraId && { cantera: { connect: { id: canteraId } } }),
            // Foto del conductor asignado AHORA: si mañana el vehículo cambia
            // de conductor, este viaje sigue atribuido a quien lo hizo.
            ...(vehicle.driverId && { driver: { connect: { id: vehicle.driverId } } }),
            userRoleType: userRoleType as any,
            status: 'EN_PROGRESO' as any,
            departureAt: capturedAt,
            observation: data.observation || null,
            departure: {
              create: {
                clientUuid: uuid,
                source,
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
          await prisma.vehicleQRCode.update({
            where: { id: vehicle.qrcode.id },
            data: { status: 'OCUPADO' as any },
          });
          this.logger.log(`QR ${vehicle.qrcode.qrcode} marcado como OCUPADO`);
        }

        // Va dentro de la misma transacción: si el viaje se guarda y el
        // movimiento no, el stock quedaría desfasado sin forma de detectarlo.
        await this.canteraStockService.registrarConsumo(prisma, {
          tripId: trip.id,
          canteraId,
          materialId,
          m3: departureM3,
          capturedAt,
        });

        return trip;
      });

      // Solo en la rama de creación real, nunca en replay.
      await this.dashboardService.incrementDepartureCount(capturedAt);

      this.logger.log(
        `Salida registrada | uuid: ${uuid} | vehicleId: ${vehicleId} | source: ${source} | receivedAt: ${new Date().toISOString()}`,
      );

      return { success: true, data: flattenTrip(transport) };
    } catch (error: any) {
      this.cleanupFiles(files);
      if (error && error.code === 'P2002') {
        throw new BusinessException(
          'DUPLICATE_UUID_CONFLICT',
          'CONFLICTO DE UUID DUPLICADO',
          false,
          409,
        );
      }
      throw error;
    }
  }

  async registerArrivalLegacy(
    id: number,
    data: any,
    files: any,
    userArrivalId: number,
  ) {
    return this.submitArrival(
      {
        ...data,
        tripId: id.toString(),
        uuid: randomUUID(),
        capturedAt: new Date().toISOString(),
        source: 'ONLINE',
      },
      files,
      userArrivalId,
    );
  }

  async submitArrival(data: any, files: any, userArrivalId: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userArrivalId },
      });
      if (!user)
        throw new BusinessException(
          'USER_NOT_FOUND',
          'USUARIO NO ENCONTRADO',
          false,
          404,
        );

      const userRoleType =
        user.role === 'ADMIN' ? 'ADMIN' : user.roletype || 'OBRA';

      if (!files?.material || files.material.length < 1) {
        throw new BusinessException(
          'MISSING_MATERIAL_PHOTO',
          'FALTA FOTO DEL MATERIAL DE LLEGADA',
          false,
          400,
        );
      }

      const clientUuid = data.uuid;
      if (!clientUuid) {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'uuid es requerido',
          false,
          400,
        );
      }

      const existingArrival = await this.prisma.transportArrival.findUnique({
        where: { clientUuid },
        include: { trip: { include: TRIP_FULL_INCLUDE } },
      });

      if (existingArrival) {
        this.cleanupFiles(files);
        return {
          success: true,
          idempotentReplay: true,
          data: flattenTrip(existingArrival.trip),
        };
      }

      const qrcode = data.qrcode;
      const tripId = data.tripId ? Number(data.tripId) : undefined;
      if (!qrcode && !tripId) {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'qrcode o tripId es requerido',
          false,
          400,
        );
      }

      let transport: any;
      let vehicleId: number;

      if (tripId) {
        transport = await this.prisma.transportTrip.findUnique({
          where: { id: tripId },
          include: {
            vehicle: { include: { qrcode: true } },
            departure: true,
            arrival: true,
          },
        });

        if (!transport) {
          throw new BusinessException(
            'TRANSPORT_NOT_FOUND',
            'NO SE ENCUENTRA EL TRANSPORTE',
            false,
            404,
          );
        }
        vehicleId = transport.vehicleId;
      } else {
        const vehicleQRCode = await this.prisma.vehicleQRCode.findUnique({
          where: { qrcode },
          include: { vehicle: true },
        });

        if (!vehicleQRCode) {
          throw new BusinessException(
            'QR_NOT_FOUND',
            'NO SE RECONOCE EL CODIGO QR',
            false,
            404,
          );
        }
        if (!vehicleQRCode.vehicle) {
          throw new BusinessException(
            'VEHICLE_NOT_FOUND',
            'EL VEHICULO NO EXISTE',
            false,
            404,
          );
        }
        vehicleId = vehicleQRCode.vehicle.id;
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
        throw new BusinessException(
          'VALIDATION_ERROR',
          'DATOS DE LLEGADA INVÁLIDOS',
          false,
          400,
        );
      }

      const capturedAt = data.capturedAt
        ? new Date(data.capturedAt)
        : new Date();
      this.validateCapturedAt(capturedAt);

      let createdNewArrival = false;
      const updated = await this.prisma.$transaction(async (prisma) => {
        let tripIdToUpdate: number;
        if (tripId) {
          tripIdToUpdate = tripId;
        } else {
          const claimResult = await prisma.$queryRaw<{ id: number }[]>`
            SELECT id FROM "TransportTrip"
            WHERE "vehicleId" = ${vehicleId}
              AND status = 'EN_PROGRESO'
              AND "departureAt" <= ${capturedAt}
            ORDER BY "departureAt" ASC
            LIMIT 1
            FOR UPDATE
          `;

          if (claimResult.length === 0) {
            throw new BusinessException(
              'NO_OPEN_DEPARTURE',
              'NO SE ENCONTRO UNA SALIDA ABIERTA',
              true,
              409,
            );
          }

          tripIdToUpdate = claimResult[0].id;
        }

        const trip = await prisma.transportTrip.findUnique({
          where: { id: tripIdToUpdate },
          include: {
            vehicle: { include: { qrcode: true } },
            departure: true,
            arrival: true,
          },
        });

        if (!trip) {
          throw new BusinessException(
            'INTERNAL_ERROR',
            'Error interno resolviendo el viaje',
            true,
            500,
          );
        }

        if (!trip.departure) {
          throw new BusinessException(
            'INTERNAL_ERROR',
            'EL VIAJE NO TIENE SALIDA ASOCIADA',
            true,
            500,
          );
        }

        if (trip.arrival) {
          this.cleanupFiles(files);
          return trip;
        }

        if (trip.status !== 'EN_PROGRESO') {
          throw new BusinessException(
            'TRIP_ALREADY_CLOSED',
            'EL VIAJE YA POSEE LLEGADA REGISTRADA',
            false,
            409,
          );
        }

        const departureM3Effective = data.departureM3Corrected
          ? parseFloat(data.departureM3Corrected)
          : trip.departure!.m3;

        const deviationM3 = arrivalM3 - departureM3Effective;
        const finalStatus =
          Math.abs(deviationM3) >= 1 ? 'ALERTA' : 'COMPLETADO';

        const updatedHeader = await prisma.transportTrip.update({
          where: { id: tripIdToUpdate },
          data: {
            arrivalAt: capturedAt,
            deviationM3,
            userArrivalId,
            userRoleType: userRoleType as any,
            status: finalStatus as any,
            initialStatus: finalStatus as any,
            departure: data.departureM3Corrected
              ? {
                  update: {
                    m3Corrected: parseFloat(data.departureM3Corrected),
                  },
                }
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

        if (trip.vehicle?.qrcode) {
          await prisma.vehicleQRCode.update({
            where: { id: trip.vehicle.qrcode.id },
            data: { status: 'DISPONIBLE' as any },
          });
          this.logger.log(
            `QR ${trip.vehicle.qrcode.qrcode} marcado como DISPONIBLE`,
          );
        }

        createdNewArrival = true;
        return updatedHeader;
      });

      if (createdNewArrival) {
        await this.dashboardService.incrementArrivalCount(capturedAt);
      }

      this.logger.log(
        `Llegada registrada con éxito | ID: ${updated.id} | Status: ${updated.status}`,
      );

      return {
        success: true,
        message: 'Llegada registrada',
        data: flattenTrip(updated),
      };
    } catch (error: any) {
      this.cleanupFiles(files);
      if (error && error.code === 'P2002') {
        throw new BusinessException(
          'DUPLICATE_UUID_CONFLICT',
          'CONFLICTO DE UUID DUPLICADO',
          false,
          409,
        );
      }
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

          // El stock se descuenta con lo que SALIÓ de la cantera, así que al
          // corregir los m3 de salida hay que reajustar el movimiento. Se
          // actualiza el renglón del viaje, no un contador: el saldo se
          // recompone solo.
          await this.canteraStockService.ajustarConsumo(
            prisma,
            id,
            data.departureM3Corrected,
          );
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

  // capturadoAt viene del reloj del teléfono (manipulable): rango aceptable
  // <= now + 5min y >= now - 90 días.
  private validateCapturedAt(capturedAt: Date) {
    const now = Date.now();
    const maxFuture = now + 5 * 60 * 1000;
    const minPast = now - 90 * 24 * 60 * 60 * 1000;
    if (capturedAt.getTime() > maxFuture || capturedAt.getTime() < minPast) {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'CAPTUREDAT FUERA DE RANGO PERMITIDO',
        false,
        400,
      );
    }
  }

  // Catálogo offline completo (1.5): la app reemplaza su copia local entera.
  // Solo entran registros activos: lo que desaparece aquí desaparece de la caché.
  async getCatalog() {
    const [vehicles, materials, plannings, constSites, clients, canteras] =
      await Promise.all([
        this.prisma.vehicle.findMany({
          where: { isActive: true },
          include: {
            qrcode: true,
            driver: true,
            owner: true,
            plannings: {
              include: {
                planning: { select: { id: true, planningCode: true } },
              },
            },
          },
          orderBy: { id: 'asc' },
        }),
        this.prisma.material.findMany({
          orderBy: { id: 'asc' },
        }),
        this.prisma.planning.findMany({
          where: { isActive: true, status: { not: 'CANCELADO' } },
          include: {
            vehicles: { select: { vehicleId: true, canteraId: true } },
            canteras: { select: { canteraId: true } },
          },
        }),
        this.prisma.constSite.findMany({
          where: { isActive: true },
          select: { id: true, name: true, abscisa: true, isActive: true },
        }),
        this.prisma.client.findMany({
          where: { isActive: true },
          select: { id: true, companyname: true },
        }),
        // La app necesita las canteras y qué material despacha cada una para
        // poder registrar salidas sin conexión.
        this.prisma.cantera.findMany({
          where: { materialProvider: { isActive: true } },
          select: {
            id: true,
            nombre: true,
            materialProviderId: true,
            materiales: { select: { materialId: true } },
          },
          orderBy: { id: 'asc' },
        }),
      ]);

    const qrIndex: Record<string, number> = {};

    const vehicleList = vehicles.map((v) => {
      if (v.qrcode) qrIndex[v.qrcode.qrcode] = v.id;
      return {
        id: v.id,
        vehicleid: v.vehicleid,
        plate: v.plate,
        type: v.type,
        company: v.company,
        capacity: v.capacity,
        isActive: v.isActive,
        qrcode: v.qrcode
          ? {
              id: v.qrcode.id,
              qrcode: v.qrcode.qrcode,
              status: v.qrcode.status,
            }
          : null,
        driver: v.driver
          ? {
              id: v.driver.id,
              name: v.driver.name,
              document: v.driver.document,
              phone: v.driver.phone,
            }
          : null,
        owner: v.owner
          ? {
              id: v.owner.id,
              name: v.owner.name,
              companyname: v.owner.companyname,
            }
          : null,
        plannings: v.plannings.map((pv) => ({
          id: pv.planning.id,
          planningCode: pv.planning.planningCode,
        })),
      };
    });

    return {
      serverTime: new Date().toISOString(),
      vehicles: vehicleList,
      qrIndex,
      materials: materials.map((m) => ({
        id: m.id,
        materialType: m.materialType,
      })),
      plannings: plannings.map((p) => ({
        id: p.id,
        planningCode: p.planningCode,
        status: p.status,
        clientId: p.clientId,
        constSiteId: p.constSiteId,
        vehicleIds: p.vehicles.map((v) => v.vehicleId),
        canteraIds: p.canteras.map((c) => c.canteraId),
        // Cantera asignada a cada vehículo: la app la usa como valor por
        // defecto al registrar la salida sin conexión.
        vehicleCanteras: p.vehicles.map((v) => ({
          vehicleId: v.vehicleId,
          canteraId: v.canteraId,
        })),
      })),
      constSites,
      clients,
      canteras: canteras.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        materialProviderId: c.materialProviderId,
        materialIds: c.materiales.map((m) => m.materialId),
      })),
    };
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
