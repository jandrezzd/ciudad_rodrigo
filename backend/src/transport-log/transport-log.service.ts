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
import { ReconciliationService } from './reconciliation/reconciliation.service';
import {
  DUPLICATE_GUARD_MIN,
  TIE_MARGIN_MIN,
} from './reconciliation/reconciliation.constants';
import { Prisma } from '@prisma/client';

@Injectable()
export class TransportLogService {
  private readonly logger = new Logger(TransportLogService.name);
  private readonly uploadDir = path.join(
    process.cwd(),
    'uploads',
    'transport',
  );

  constructor(
    private prisma: PrismaService,
    private dashboardService: DashboardService,
    private canteraStockService: CanteraStockService,
    private reconciliationService: ReconciliationService,
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

      // Compatibilidad con el frontend/app actuales (deciden la pantalla según
      // action: CREATE_DEPARTURE/CONTINUE_TO_ARRIVAL). Con varias vueltas
      // simultáneas del mismo vehículo (offline) puede haber más de una salida
      // abierta; se toma la MÁS RECIENTE, el mismo criterio de menor diferencia
      // de tiempo que usa el emparejamiento.
      //
      // Incluye PENDIENTE_EMPAREJAMIENTO, que antes quedaba fuera. Ese estado
      // no es terminal — es "salida abierta hace rato" — y omitirlo hacía que
      // al escanear el QR de un vehículo con un viaje viejo sin cerrar la
      // respuesta fuera CREATE_DEPARTURE ("está libre"), justo en el caso más
      // propenso a que alguien registre una salida duplicada. La app usa este
      // dato para avisar "este vehículo ya tiene una salida abierta".
      const activeTransport = await this.prisma.transportTrip.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'] as any },
          arrival: null,
        },
        include: TRIP_FULL_INCLUDE,
        orderBy: { departureAt: 'desc' },
      });

      // El vehículo va en AMBAS respuestas. Antes solo lo llevaba
      // CREATE_DEPARTURE, y el supervisor de cantera que escaneaba un vehículo
      // con viaje abierto recibía CONTINUE_TO_ARRIVAL sin vehículo: la app lo
      // interpretaba como "no se encontró el vehículo" en vez de avisarle que
      // ya tenía una salida registrada. El dato es el mismo en los dos casos,
      // no tiene sentido que dependa de la rama.
      const vehiclePayload = {
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
        drivername: vehicle.driver?.name ?? null,
      };

      if (activeTransport) {
        return {
          action: 'CONTINUE_TO_ARRIVAL',
          transportId: activeTransport.id,
          vehicle: vehiclePayload,
          data: flattenTrip(activeTransport),
        };
      }

      return {
        action: 'CREATE_DEPARTURE',
        vehicle: vehiclePayload,
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

      if (user.role !== 'SUPERVISOR') {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'USTED NO ES UN SUPERVISOR',
          false,
          400,
        );
      }
      // A este punto user.role solo puede ser 'SUPERVISOR' (ver guard arriba).
      const userRoleType = user.roletype || 'CANTERA';

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
      const canteraIdExplicita = data.canteraId
        ? parseInt(data.canteraId)
        : null;

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

      // Guard anti-duplicado. Dos salidas del mismo vehículo separadas por
      // pocos minutos son el mismo despacho cargado dos veces (el supervisor
      // escaneó el QR otra vez y llenó el formulario de nuevo, con un uuid
      // distinto, así que la idempotencia por clientUuid no lo detecta).
      //
      // Deliberadamente NO se rechaza "ya tiene un viaje abierto": varias
      // vueltas simultáneas del mismo vehículo trabajando offline son
      // legítimas y el emparejamiento depende de que lo sigan siendo. El
      // duplicado real tiene firma temporal, no de estado.
      //
      // MIGRATED queda exento: es el ADMIN reponiendo a mano un registro
      // pasado, que es justamente lo contrario de un duplicado accidental.
      if (source !== 'MIGRATED') {
        const guardMs = DUPLICATE_GUARD_MIN * 60_000;
        const salidaCercana = await this.prisma.transportTrip.findFirst({
          where: {
            vehicleId,
            departureAt: {
              gte: new Date(capturedAt.getTime() - guardMs),
              lte: new Date(capturedAt.getTime() + guardMs),
            },
          },
          orderBy: { departureAt: 'desc' },
        });
        if (salidaCercana) {
          throw new BusinessException(
            'DUPLICATE_DEPARTURE_WINDOW',
            `YA EXISTE UNA SALIDA DE ESTE VEHÍCULO A LAS ${this.formatFechaHora(salidaCercana.departureAt)}. NO SE PUEDE REGISTRAR OTRA DENTRO DE ${DUPLICATE_GUARD_MIN} MINUTOS.`,
            // retryable=false es esencial: el SyncWorker del móvil reintenta
            // durante 72 h todo lo que venga marcado como reintentable, y este
            // error nunca se va a resolver solo.
            false,
            409,
          );
        }
      }

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
            ...(vehicle.driverId && {
              driver: { connect: { id: vehicle.driverId } },
            }),
            userRoleType: userRoleType as any,
            status: 'EN_PROGRESO' as any,
            departureAt: capturedAt,
            almuerzoAplicado: this.parseBoolean(data.almuerzo),
            departure: {
              create: {
                clientUuid: uuid,
                source,
                capturedAt,
                userId,
                m3: departureM3,
                lat: departureLat,
                lng: departureLng,
                almuerzo: this.parseBoolean(data.almuerzo),
                observation: data.observation || null,
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

      // Disparador 1 del emparejamiento (plan 1.2): fuera de la transacción de
      // creación, en su propio try/catch interno — nunca debe hacer perder
      // una salida ya registrada si falla.
      await this.reconciliationService.tryMatchNewDeparture(transport.id);

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
        // Antes se forzaban aquí un uuid nuevo y la hora del servidor,
        // ignorando lo que mandara el cliente. Eso rompía las dos cosas: una
        // llegada repuesta a mano quedaba con la fecha de hoy en vez de la
        // real, y el reintento del mismo envío creaba un registro nuevo en vez
        // de reconocerse como repetido. Se respetan si vienen; si no, se
        // mantiene exactamente el comportamiento anterior.
        uuid: data.uuid || randomUUID(),
        capturedAt: data.capturedAt || new Date().toISOString(),
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

      // Idempotencia de llegadas que quedaron en staging (sin salida
      // conocida todavía): mismo patrón que existingArrival de arriba, para
      // que un reintento del mismo envío no choque con el UNIQUE de clientUuid.
      const existingPending =
        await this.prisma.transportArrivalPending.findUnique({
          where: { clientUuid },
          include: { matchedTrip: { include: TRIP_FULL_INCLUDE } },
        });
      if (existingPending) {
        this.cleanupFiles(files);
        return {
          success: true,
          idempotentReplay: true,
          pendingMatch: existingPending.status !== 'EMPAREJADO',
          data: existingPending.matchedTrip
            ? flattenTrip(existingPending.matchedTrip)
            : null,
        };
      }

      const qrcode = data.qrcode;
      let tripId = data.tripId ? Number(data.tripId) : undefined;
      const departureUuid = data.departureUuid as string | undefined;
      if (!qrcode && !tripId && !departureUuid) {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'qrcode, tripId o departureUuid es requerido',
          false,
          400,
        );
      }

      let transport: any;
      let vehicleId: number;

      if (departureUuid) {
        transport = await this.prisma.transportTrip.findUnique({
          where: { uuid: departureUuid },
          include: {
            vehicle: { include: { qrcode: true } },
            departure: true,
            arrival: true,
          },
        });

        if (!transport) {
          throw new BusinessException(
            'NO_OPEN_DEPARTURE',
            'NO SE ENCONTRO UNA SALIDA ABIERTA',
            true,
            409,
          );
        }
        if (transport.status !== 'EN_PROGRESO' && !transport.arrival) {
          throw new BusinessException(
            'NO_OPEN_DEPARTURE',
            'NO SE ENCONTRO UNA SALIDA ABIERTA',
            true,
            409,
          );
        }
        vehicleId = transport.vehicleId;
        tripId = transport.id;
      } else if (tripId) {
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

      // Guard anti-duplicado, espejo del de submitDeparture. Se comprueban las
      // dos tablas: una llegada puede haber quedado como TransportArrival (si
      // encontró su salida) o en staging (si no).
      if ((data.source as string) !== 'MIGRATED') {
        const guardMs = DUPLICATE_GUARD_MIN * 60_000;
        const desde = new Date(capturedAt.getTime() - guardMs);
        const hasta = new Date(capturedAt.getTime() + guardMs);

        const [llegadaCercana, pendienteCercana] = await Promise.all([
          this.prisma.transportArrival.findFirst({
            where: {
              capturedAt: { gte: desde, lte: hasta },
              trip: { vehicleId },
            },
          }),
          this.prisma.transportArrivalPending.findFirst({
            where: {
              vehicleId,
              capturedAt: { gte: desde, lte: hasta },
              status: { not: 'EMPAREJADO' },
            },
          }),
        ]);

        const yaRegistrada = llegadaCercana ?? pendienteCercana;
        if (yaRegistrada) {
          throw new BusinessException(
            'DUPLICATE_ARRIVAL_WINDOW',
            `YA EXISTE UNA LLEGADA DE ESTE VEHÍCULO A LAS ${this.formatFechaHora(yaRegistrada.capturedAt)}. NO SE PUEDE REGISTRAR OTRA DENTRO DE ${DUPLICATE_GUARD_MIN} MINUTOS.`,
            false,
            409,
          );
        }
      }

      let createdNewArrival = false;
      let pendingStaged = false;
      const updated = await this.prisma.$transaction(async (prisma) => {
        let tripIdToUpdate: number;
        if (tripId) {
          tripIdToUpdate = tripId;
        } else {
          // Antes: FIFO puro (`status = 'EN_PROGRESO' ORDER BY departureAt ASC
          // LIMIT 1`), sin exigir que la llegada fuera posterior a la salida.
          // Eso cerraba una salida de días atrás con la llegada de hoy, y
          // dejaba fuera los viajes ya marcados PENDIENTE_EMPAREJAMIENTO —
          // que nunca fue un estado terminal.
          //
          // Ahora: la salida ANTERIOR más reciente (menor diferencia de
          // tiempo, visto desde el lado de la llegada). Se piden 2 para poder
          // detectar el empate.
          const claimResult = await prisma.$queryRaw<
            { id: number; departureAt: Date }[]
          >`
            SELECT id, "departureAt" FROM "TransportTrip"
            WHERE "vehicleId" = ${vehicleId}
              AND status IN ('EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO')
              AND "departureAt" < ${capturedAt}
            ORDER BY "departureAt" DESC
            LIMIT 2
            FOR UPDATE
          `;

          // Un solo objeto para las dos ramas que hacen staging. Va ANOTADO con
          // el tipo de Prisma a propósito: al sacarlo del `create({ data: ... })`
          // se pierde la inferencia que validaba los campos, y un campo que
          // falte o esté mal escrito pasaría silenciosamente. Con la anotación
          // rompe la compilación.
          const pendingArrivalData: Prisma.TransportArrivalPendingUncheckedCreateInput =
            {
              clientUuid,
              source: (data.source as any) || 'ONLINE',
              capturedAt,
              vehicleId,
              userId: userArrivalId,
              m3: arrivalM3,
              m3Corrected: data.arrivalM3Corrected
                ? parseFloat(data.arrivalM3Corrected)
                : null,
              lat: arrivalLat,
              lng: arrivalLng,
              abscisa: data.abscisa ? parseInt(data.abscisa) : null,
              almuerzo: this.parseBoolean(data.almuerzo),
              observation: data.observation || null,
              ...photos,
            };

          if (claimResult.length === 0) {
            // No hay salida abierta anterior de este vehículo TODAVÍA — puede
            // seguir offline en el otro celular. Ya no se rechaza (antes: 409
            // NO_OPEN_DEPARTURE): se guarda en staging y se resuelve después,
            // cuando la salida sincronice (disparador 1) o por el job
            // periódico (disparador 3). Las ramas por departureUuid/tripId
            // explícito arriba SÍ siguen fallando duro: esas solo las manda
            // el mismo dispositivo que hizo la salida, así que no encontrarla
            // ahí es un error de cliente genuino, no este escenario.
            await prisma.transportArrivalPending.create({
              data: pendingArrivalData,
            });
            pendingStaged = true;
            return null;
          }

          if (claimResult.length === 2) {
            const gap0 =
              capturedAt.getTime() - claimResult[0].departureAt.getTime();
            const gap1 =
              capturedAt.getTime() - claimResult[1].departureAt.getTime();
            if (gap1 - gap0 < TIE_MARGIN_MIN * 60_000) {
              // Empate real: no adivinar. Igual que "0 resultados", va a
              // staging y lo resuelve el barrido (que ve el conjunto completo
              // del vehículo) o el administrador a mano.
              await prisma.transportArrivalPending.create({
                data: pendingArrivalData,
              });
              pendingStaged = true;
              return null;
            }
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

        // PENDIENTE_EMPAREJAMIENTO se acepta: es una salida abierta que lleva
        // rato esperando su llegada, no un viaje cerrado. La búsqueda de
        // arriba lo elige a propósito, así que rechazarlo acá anularía el
        // cambio. (La rama por tripId explícito puede traer cualquier estado,
        // de ahí que la comprobación siga existiendo.)
        if (!['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'].includes(trip.status)) {
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
        const almuerzoAplicado =
          trip.almuerzoAplicado || this.parseBoolean(data.almuerzo);

        const updatedHeader = await prisma.transportTrip.update({
          where: { id: tripIdToUpdate },
          data: {
            arrivalAt: capturedAt,
            deviationM3,
            userArrivalId,
            userRoleType: userRoleType as any,
            status: finalStatus as any,
            initialStatus: finalStatus as any,
            almuerzoAplicado,
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
                almuerzo: this.parseBoolean(data.almuerzo),
                observation: data.observation || null,
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

      if (pendingStaged) {
        this.logger.log(
          `Llegada sin salida conocida todavía | vehicleId: ${vehicleId} | clientUuid: ${clientUuid} | queda en staging`,
        );
        return {
          success: true,
          pendingMatch: true,
          message: 'Llegada registrada, pendiente de emparejar con su salida',
          data: null,
        };
      }

      if (!updated) {
        // No debería pasar: pendingStaged es la única rama que devuelve null
        // dentro de la transacción, y ya se manejó arriba.
        throw new BusinessException(
          'INTERNAL_ERROR',
          'Error interno resolviendo la llegada',
          true,
          500,
        );
      }

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
    data: {
      departureM3Corrected?: number;
      arrivalM3Corrected?: number;
      observation?: string;
    },
    userId: number,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('EL USUARIO NO EXISTE');

      // La restricción existía solo en la UI: sin esto, cualquier usuario
      // autenticado (un chofer con su token) podía corregir los m³ de
      // cualquier viaje llamando la API directo. Se admiten los dos roles que
      // realmente usan la pantalla: el módulo de transporte (ADMIN) y el de
      // jefe de obra (JEFE_DE_OBRA, que además solo puede tocar viajes en
      // ALERTA — esa regla más fina sigue vigente unas líneas más abajo).
      if (!['ADMIN', 'JEFE_DE_OBRA'].includes(user.role)) {
        throw new BusinessException(
          'FORBIDDEN',
          'NO TIENE PERMISOS PARA REALIZAR ESTA ACCIÓN',
          false,
          403,
        );
      }

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
            ...(data.observation !== undefined && {
              observation: data.observation || null,
            }),
          },
          include: TRIP_FULL_INCLUDE,
        });
      });

      return { success: true, data: flattenTrip(updated) };
    } catch (error) {
      throw error;
    }
  }

  async markAsAlert(id: number, userId: number) {
    try {
      await this.assertRole(userId, ['ADMIN']);

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

  async updateTransportStatus(id: number, newStatus: string, userId: number) {
    try {
      await this.assertRole(userId, ['ADMIN']);

      const transport = await this.prisma.transportTrip.findUnique({
        where: { id },
      });
      if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');

      // Lista blanca de destinos. Antes se escribía `newStatus as any` directo:
      // un valor fuera del enum llegaba hasta Prisma y salía como 500, y uno
      // válido pero arbitrario (devolver a EN_PROGRESO un viaje ya cerrado, o
      // saltar a VALIDADO sin revisar) pasaba sin ningún control. La UI solo
      // usa REVISADO; el resto de transiciones tiene su propio endpoint.
      const destinosPermitidos = ['REVISADO', 'VALIDADO', 'CANCELADO'];
      if (!destinosPermitidos.includes(newStatus)) {
        throw new BusinessException(
          'VALIDATION_ERROR',
          `NO SE PUEDE CAMBIAR EL ESTADO A ${newStatus} POR ESTA VÍA`,
          false,
          400,
        );
      }

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

  private async assertRole(userId: number, allowedRoles: string[]) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('EL USUARIO NO EXISTE');
    if (!allowedRoles.includes(user.role)) {
      throw new BusinessException(
        'FORBIDDEN',
        'NO TIENE PERMISOS PARA REALIZAR ESTA ACCIÓN',
        false,
        403,
      );
    }
    return user;
  }

  // Cola de revisión (plan 1.3): llegadas que sincronizaron sin encontrar
  // salida abierta (vehículo averiado, o la salida sigue offline en el otro
  // celular). EXPIRADO se incluye porque sigue siendo emparejable a mano, y
  // EN_REVISION porque es justamente una llegada esperando decisión del ADMIN
  // tras un desemparejamiento — si no apareciera acá, quedaría inaccesible.
  async getPendingArrivals(userId: number) {
    // Mismo rol que manualMatch. Antes estas dos listas admitían también
    // JEFE_DE_OBRA y PLANIFICADOR: esos usuarios podían cargar el panel de
    // conciliación entero y recibían un 403 recién al pulsar "Emparejar".
    // Mostrar trabajo que el usuario no puede hacer es peor que no mostrarlo.
    await this.assertRole(userId, ['ADMIN']);

    const rows = await this.prisma.transportArrivalPending.findMany({
      where: { status: { in: ['PENDIENTE', 'EXPIRADO', 'EN_REVISION'] } },
      include: {
        vehicle: { select: { id: true, plate: true, vehicleid: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { capturedAt: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      vehicleId: r.vehicleId,
      plate: r.vehicle.plate,
      vehicleCode: r.vehicle.vehicleid,
      capturedAt: r.capturedAt,
      receivedAt: r.receivedAt,
      m3: r.m3,
      m3Corrected: r.m3Corrected,
      abscisa: r.abscisa,
      almuerzo: r.almuerzo,
      observation: r.observation,
      registradoPor: r.user?.name ?? null,
    }));
  }

  // La otra mitad de la cola de revisión: salidas sin llegada que las cierre
  // (mismo vehículo averiado, o la llegada sigue offline en el otro celular).
  async getUnmatchedDepartures(userId: number) {
    // Ver la nota de getPendingArrivals: alineado con manualMatch (ADMIN).
    await this.assertRole(userId, ['ADMIN']);

    const rows = await this.prisma.transportTrip.findMany({
      where: {
        status: { in: ['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'] },
        arrival: null,
      },
      include: TRIP_FULL_INCLUDE,
      orderBy: { departureAt: 'desc' },
    });

    return flattenTrips(rows);
  }

  // Emparejamiento manual (plan 1.3): a diferencia del automático, NO exige
  // misma placa — es la vía de escape cuando un vehículo se averió y otro lo
  // reemplazó a mitad de viaje (la llegada quedó con la placa del reemplazo).
  async manualMatch(tripId: number, pendingArrivalId: number, userId: number) {
    await this.assertRole(userId, ['ADMIN']);

    const trip = await this.prisma.transportTrip.findUnique({
      where: { id: tripId },
      include: { departure: true, arrival: true },
    });
    if (!trip) throw new NotFoundException('EL VIAJE NO EXISTE');

    const pending = await this.prisma.transportArrivalPending.findUnique({
      where: { id: pendingArrivalId },
    });
    if (!pending) throw new NotFoundException('LA LLEGADA PENDIENTE NO EXISTE');
    if (pending.status === 'EMPAREJADO') {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'ESA LLEGADA YA FUE EMPAREJADA CON OTRO VIAJE',
        false,
        409,
      );
    }

    // Prevalidación fuera de la transacción: son las mismas condiciones que
    // comprueba closeTripWithPendingArrival, pero acá el mensaje llega al ADMIN
    // sin que la fila pendiente pase por el reclamo atómico y vuelva atrás. El
    // panel web no se auto-refresca y el barrido corre cada 5 min, así que
    // trabajar sobre una lista obsoleta es el caso normal, no el raro.
    if (!['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'].includes(trip.status)) {
      throw new BusinessException(
        'TRIP_NOT_ELIGIBLE',
        `EL VIAJE YA NO ESTÁ ABIERTO (ESTADO ${trip.status}). REFRESQUE LA LISTA.`,
        false,
        409,
      );
    }
    if (trip.arrival) {
      throw new BusinessException(
        'TRIP_ALREADY_CLOSED',
        'EL VIAJE YA TIENE UNA LLEGADA REGISTRADA. REFRESQUE LA LISTA.',
        false,
        409,
      );
    }
    if (!trip.departure) {
      throw new BusinessException(
        'TRIP_WITHOUT_DEPARTURE',
        'EL VIAJE NO TIENE SALIDA ASOCIADA, NO SE PUEDE EMPAREJAR',
        false,
        422,
      );
    }

    // Causalidad: un vehículo no puede llegar antes de salir. El emparejamiento
    // manual no exige misma placa (ver comentario de arriba) pero esto sí es
    // innegociable — sin este control se puede dejar un viaje con
    // arrivalAt < departureAt, que no tiene sentido físico, envenena el cálculo
    // de duración de los reportes y no hay ningún CHECK en la BD que lo impida.
    if (pending.capturedAt <= trip.departureAt) {
      throw new BusinessException(
        'ARRIVAL_BEFORE_DEPARTURE',
        `LA LLEGADA (${this.formatFechaHora(pending.capturedAt)}) NO PUEDE SER ANTERIOR A LA SALIDA (${this.formatFechaHora(trip.departureAt)})`,
        false,
        409,
      );
    }

    const closed = await this.closeMatchMappingPrismaErrors(
      tripId,
      pendingArrivalId,
    );
    if (!closed) {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'NO SE PUDO EMPAREJAR: EL VIAJE YA NO ESTÁ DISPONIBLE O LA LLEGADA YA FUE TOMADA POR OTRO PROCESO',
        false,
        409,
      );
    }

    const updated = await this.prisma.transportTrip.findUnique({
      where: { id: tripId },
      include: TRIP_FULL_INCLUDE,
    });
    this.logger.log(
      `Viaje ${tripId} emparejado manualmente por usuario ${userId} con llegada pendiente ${pendingArrivalId}`,
    );
    return { success: true, data: updated ? flattenTrip(updated) : null };
  }

  /**
   * Traduce los errores de Prisma que puede lanzar el cierre a errores de
   * negocio con mensaje. Sin esto, un P2002/P2028 sube crudo hasta el filtro
   * global y sale como 500 "Internal server error" — el mismo patrón que ya
   * usan submitDeparture y submitArrival, que aquí faltaba.
   */
  private async closeMatchMappingPrismaErrors(
    tripId: number,
    pendingArrivalId: number,
  ): Promise<boolean> {
    try {
      return await this.reconciliationService.closeTripWithPendingArrival(
        tripId,
        pendingArrivalId,
      );
    } catch (error: any) {
      if (error instanceof BusinessException) throw error;

      if (error?.code === 'P2002') {
        const campo = Array.isArray(error?.meta?.target)
          ? error.meta.target.join(', ')
          : (error?.meta?.target ?? 'desconocido');
        this.logger.error(
          `manualMatch(${tripId}, ${pendingArrivalId}) chocó con un índice único (${campo})`,
          error.stack,
        );
        throw new BusinessException(
          'DUPLICATE_CONFLICT',
          `NO SE PUDO EMPAREJAR: YA EXISTE OTRO REGISTRO CON EL MISMO ${campo}. REVISE SI LA LLEGADA SE REGISTRÓ DOS VECES.`,
          false,
          409,
        );
      }

      if (error?.code === 'P2028') {
        this.logger.error(
          `manualMatch(${tripId}, ${pendingArrivalId}): timeout de transacción`,
          error.stack,
        );
        throw new BusinessException(
          'TRANSACTION_TIMEOUT',
          'LA BASE DE DATOS TARDÓ DEMASIADO. VUELVA A INTENTARLO.',
          true,
          503,
        );
      }

      throw error;
    }
  }

  /**
   * Alta manual de una llegada huérfana (Fase 2.3). Hasta ahora la cola de
   * conciliación solo se podía llenar desde el móvil: si lo que faltaba era la
   * LLEGADA y no la salida, no había forma de reponerla desde la web y el viaje
   * quedaba abierto para siempre.
   *
   * Queda como TransportArrivalPending normal (status PENDIENTE), así que el
   * emparejamiento automático la toma igual que a cualquier otra.
   */
  async createPendingArrival(
    data: {
      vehicleId: number;
      capturedAt: string;
      m3: number;
      m3Corrected?: number;
      abscisa?: number;
      almuerzo?: boolean;
      reason: string;
    },
    userId: number,
  ) {
    await this.assertRole(userId, ['ADMIN']);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: data.vehicleId },
    });
    if (!vehicle) throw new NotFoundException('EL VEHICULO NO EXISTE');

    const capturedAt = new Date(data.capturedAt);
    if (isNaN(capturedAt.getTime())) {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'FECHA Y HORA DE LLEGADA INVÁLIDA',
        false,
        400,
      );
    }
    // Mismo rango que acepta el móvil (-90 días / +5 min): reponer a mano no
    // habilita inventar registros del año pasado ni del futuro.
    this.validateCapturedAt(capturedAt);

    // Un registro del mismo vehículo al mismo minuto casi seguro es la misma
    // llegada cargada dos veces (doble clic, o alguien que ya la repuso).
    const yaExiste = await this.prisma.transportArrivalPending.findFirst({
      where: {
        vehicleId: data.vehicleId,
        capturedAt: {
          gte: new Date(capturedAt.getTime() - 60_000),
          lte: new Date(capturedAt.getTime() + 60_000),
        },
        status: { not: 'EMPAREJADO' },
      },
    });
    if (yaExiste) {
      throw new BusinessException(
        'DUPLICATE_PENDING_ARRIVAL',
        `YA HAY UNA LLEGADA PENDIENTE DE ESTE VEHÍCULO A LAS ${this.formatFechaHora(yaExiste.capturedAt)}`,
        false,
        409,
      );
    }

    const created = await this.prisma.transportArrivalPending.create({
      data: {
        clientUuid: randomUUID(),
        source: 'MIGRATED',
        capturedAt,
        vehicleId: data.vehicleId,
        userId,
        m3: data.m3,
        m3Corrected: data.m3Corrected ?? null,
        abscisa: data.abscisa ?? null,
        almuerzo: data.almuerzo ?? false,
        observation: `[${new Date().toISOString()}] Llegada repuesta manualmente (usuario ${userId}). Motivo: ${data.reason.trim()}`,
      },
    });

    this.logger.log(
      `Llegada pendiente ${created.id} creada manualmente por usuario ${userId} | vehicleId: ${data.vehicleId} | capturedAt: ${capturedAt.toISOString()}`,
    );

    // Puede cerrar de inmediato una salida que ya estaba esperándola.
    try {
      await this.reconciliationService.runReconciliationSweep();
    } catch (error: any) {
      this.logger.error(
        `Llegada ${created.id} creada, pero falló el intento inmediato de emparejar: ${error.message}. El barrido periódico lo reintenta.`,
      );
    }

    return { success: true, data: created };
  }

  /**
   * Deshace un emparejamiento: borra la llegada del viaje, lo reabre y devuelve
   * la llegada a la cola de conciliación para que el ADMIN la empareje con la
   * salida correcta.
   *
   * Sin límite de tiempo a propósito: los errores de emparejamiento se detectan
   * al revisar los reportes, días después. Los candados son de rol, motivo
   * obligatorio y estado (un viaje ya REVISADO o VALIDADO no se toca).
   *
   * La llegada vuelve como EN_REVISION y no como PENDIENTE: el barrido
   * automático corre cada 5 minutos y solo mira las PENDIENTE, así que
   * devolverla en ese estado haría que el cron rehiciera el mismo par que se
   * acaba de deshacer.
   */
  async unmatchTrip(id: number, reason: string, userId: number) {
    await this.assertRole(userId, ['ADMIN']);

    const trip = await this.prisma.transportTrip.findUnique({
      where: { id },
      include: {
        arrival: true,
        departure: true,
        vehicle: { include: { qrcode: true } },
        matchedFrom: true,
      },
    });
    if (!trip) throw new NotFoundException('EL VIAJE NO EXISTE');

    if (!trip.arrival) {
      throw new BusinessException(
        'TRIP_NOT_MATCHED',
        'ESTE VIAJE NO TIENE LLEGADA REGISTRADA, NO HAY NADA QUE DESEMPAREJAR',
        false,
        409,
      );
    }
    if (trip.status === 'REVISADO' || trip.status === 'VALIDADO') {
      throw new BusinessException(
        'VALIDATION_ERROR',
        `NO SE PUEDE DESEMPAREJAR UN VIAJE EN ESTADO ${trip.status}`,
        false,
        400,
      );
    }

    const arrival = trip.arrival;
    const noteLine = `[${new Date().toISOString()}] Desemparejado (usuario ${userId}): se liberó la llegada del ${this.formatFechaHora(arrival.capturedAt)} (${arrival.m3} m³). Motivo: ${reason.trim()}`;
    const observation = trip.observation
      ? `${trip.observation}\n${noteLine}`
      : noteLine;

    await this.prisma.$transaction(
      async (tx) => {
        await tx.transportArrival.delete({ where: { id: arrival.id } });

        await tx.transportTrip.update({
          where: { id },
          data: {
            arrivalAt: null,
            deviationM3: null,
            userArrivalId: null,
            status: 'PENDIENTE_EMPAREJAMIENTO' as any,
            initialStatus: null,
            // El viaje vuelve a valer solo lo que dijo la cantera; el almuerzo
            // que aportaba la llegada se va con ella.
            almuerzoAplicado: trip.departure?.almuerzo ?? false,
            observation,
          },
        });

        if (trip.matchedFrom) {
          // Vino de staging: la fila original sigue ahí con todos sus datos,
          // basta con devolverla a la cola.
          await tx.transportArrivalPending.update({
            where: { id: trip.matchedFrom.id },
            data: { status: 'EN_REVISION', matchedTripId: null },
          });
        } else {
          // Llegada registrada online directo contra este viaje: nunca existió
          // fila de staging. Se crea ahora copiando todo, si no el dato (y las
          // fotos, que quedan referenciadas por esta fila) se perdería al
          // borrar la llegada.
          await tx.transportArrivalPending.create({
            data: {
              clientUuid: arrival.clientUuid,
              source: arrival.source,
              capturedAt: arrival.capturedAt,
              receivedAt: arrival.receivedAt,
              vehicleId: trip.vehicleId,
              userId: arrival.userId,
              m3: arrival.m3,
              m3Corrected: arrival.m3Corrected,
              lat: arrival.lat,
              lng: arrival.lng,
              abscisa: arrival.abscisa,
              almuerzo: arrival.almuerzo,
              observation: arrival.observation,
              driverPhoto: arrival.driverPhoto,
              vehiclePhoto: arrival.vehiclePhoto,
              platePhoto: arrival.platePhoto,
              materialPhoto1: arrival.materialPhoto1,
              materialPhoto2: arrival.materialPhoto2,
              status: 'EN_REVISION',
            },
          });
        }

        // El viaje queda abierto otra vez, así que el vehículo vuelve a estar
        // ocupado por él.
        if (trip.vehicle?.qrcode) {
          await tx.vehicleQRCode.update({
            where: { id: trip.vehicle.qrcode.id },
            data: { status: 'OCUPADO' as any },
          });
        }
      },
      { timeout: 15_000 },
    );

    // Igual que en el emparejamiento: aislado, porque el desemparejamiento ya
    // está guardado y un fallo de estadísticas no debe devolver un 500.
    try {
      await this.dashboardService.decrementArrivalCount(arrival.capturedAt);
    } catch (error: any) {
      this.logger.error(
        `Viaje ${id} desemparejado, pero falló el contador de llegadas del dashboard: ${error.message}. Corregible con recomputeDailyStats.`,
      );
    }

    const updated = await this.prisma.transportTrip.findUnique({
      where: { id },
      include: TRIP_FULL_INCLUDE,
    });
    this.logger.log(
      `Viaje ${id} desemparejado por usuario ${userId}. Motivo: ${reason.trim()}`,
    );
    return { success: true, data: updated ? flattenTrip(updated) : null };
  }

  /** dd/MM/yyyy HH:mm en hora local, para mensajes de error legibles. */
  private formatFechaHora(fecha: Date): string {
    const dosDigitos = (n: number) => String(n).padStart(2, '0');
    return (
      `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)}/${fecha.getFullYear()}` +
      ` ${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
    );
  }

  // Reasigna vehículo/chofer de un viaje ya creado (plan 1.3): caso vehículo
  // averiado, donde otro vehículo/chofer terminó el viaje. Sin tabla de
  // auditoría dedicada en v1: el motivo queda anexado a observation.
  async reassignTrip(
    id: number,
    data: { vehicleId?: number; driverId?: number; reason: string },
    userId: number,
  ) {
    await this.assertRole(userId, ['ADMIN']);

    if (data.vehicleId == null && data.driverId == null) {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'DEBE ENVIAR vehicleId O driverId PARA REASIGNAR',
        false,
        400,
      );
    }

    const trip = await this.prisma.transportTrip.findUnique({
      where: { id },
      include: { vehicle: { include: { qrcode: true } }, arrival: true },
    });
    if (!trip) throw new NotFoundException('EL REGISTRO NO EXISTE');

    if (trip.status === 'REVISADO' || trip.status === 'VALIDADO') {
      throw new BusinessException(
        'VALIDATION_ERROR',
        `NO SE PUEDE REASIGNAR UN VIAJE EN ESTADO ${trip.status}`,
        false,
        400,
      );
    }

    let newVehicle: any = null;
    if (data.vehicleId != null && data.vehicleId !== trip.vehicleId) {
      newVehicle = await this.prisma.vehicle.findUnique({
        where: { id: data.vehicleId },
        include: { qrcode: true },
      });
      if (!newVehicle) {
        throw new NotFoundException('EL VEHÍCULO NUEVO NO EXISTE');
      }
      if (!newVehicle.isActive) {
        throw new BusinessException(
          'VEHICLE_INACTIVE',
          'EL VEHÍCULO NUEVO ESTÁ INACTIVO',
          false,
          422,
        );
      }
    }

    if (data.driverId != null) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: data.driverId },
      });
      if (!driver) throw new NotFoundException('EL CHOFER NO EXISTE');
      if (!driver.isActive) {
        throw new BusinessException(
          'DRIVER_INACTIVE',
          'EL CHOFER ESTÁ INACTIVO',
          false,
          422,
        );
      }
    }

    // Sigue con salida abierta (aún no llegó, o llegó con novedad y todavía
    // no se cerró): solo ahí tiene sentido mover la ocupación del QR.
    const isOpen = !trip.arrival;

    const changes: string[] = [];
    if (newVehicle) {
      changes.push(`vehículo ${trip.vehicle.plate} -> ${newVehicle.plate}`);
    }
    if (data.driverId != null) {
      changes.push(
        `chofer (driverId ${trip.driverId ?? 'ninguno'} -> ${data.driverId})`,
      );
    }
    const noteLine = `[${new Date().toISOString()}] Reasignación (usuario ${userId}): ${changes.join('; ')}. Motivo: ${data.reason.trim()}`;
    const observation = trip.observation
      ? `${trip.observation}\n${noteLine}`
      : noteLine;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (newVehicle && isOpen) {
        if (trip.vehicle?.qrcode) {
          await tx.vehicleQRCode.update({
            where: { id: trip.vehicle.qrcode.id },
            data: { status: 'DISPONIBLE' as any },
          });
        }
        if (newVehicle.qrcode) {
          await tx.vehicleQRCode.update({
            where: { id: newVehicle.qrcode.id },
            data: { status: 'OCUPADO' as any },
          });
        }
      }

      return tx.transportTrip.update({
        where: { id },
        data: {
          ...(newVehicle && { vehicleId: newVehicle.id }),
          ...(data.driverId != null && { driverId: data.driverId }),
          observation,
        },
        include: TRIP_FULL_INCLUDE,
      });
    });

    this.logger.log(
      `Viaje ${id} reasignado por usuario ${userId}: ${changes.join('; ')}`,
    );
    return { success: true, data: flattenTrip(updated) };
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

  // data.almuerzo llega como string ("true"/"false") desde multipart/form-data:
  // !!"false" sería true por ser un string no vacío, de ahí este parseo explícito.
  private parseBoolean(value: any): boolean {
    return value === true || value === 'true';
  }

  // Catálogo offline completo (1.5): la app reemplaza su copia local entera.
  // Solo entran registros activos: lo que desaparece aquí desaparece de la caché.
  async getCatalog() {
    const [
      vehicles,
      materials,
      plannings,
      constSites,
      clients,
      canteras,
      openTrips,
    ] = await Promise.all([
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
      // Viajes EN_PROGRESO: permiten que OBRA resuelva "viaje activo" al
      // escanear el QR de llegada sin conexión (ver CachedOpenTrip en la app).
      this.prisma.transportTrip.findMany({
        where: { status: 'EN_PROGRESO' as any },
        include: TRIP_FULL_INCLUDE,
        orderBy: { departureAt: 'asc' },
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
      openTrips: openTrips.map((t) => ({
        id: t.id,
        vehicleId: t.vehicleId,
        data: flattenTrip(t),
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
