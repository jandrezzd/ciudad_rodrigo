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
import { siguienteCodigoViaje } from '../common/codigo-secuencial';
import { CanteraStockService } from './cantera-stock.service';
import { ReconciliationService } from './reconciliation/reconciliation.service';
import {
  DUPLICATE_GUARD_MIN,
  MAX_MATCH_GAP_HOURS,
  TIE_MARGIN_MIN,
} from './reconciliation/reconciliation.constants';
import { Prisma } from '@prisma/client';

@Injectable()
export class TransportLogService {
  private readonly logger = new Logger(TransportLogService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'transport');

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
      // abierta a la vez — normal en esta operación, no una anomalía.
      //
      // Se piden 2 para poder DETECTAR la ambigüedad, no para resolverla acá:
      // devolver "la más reciente" sin más (como se hacía antes) ataba la
      // llegada a un viaje concreto en el momento del escaneo, y si había un
      // segundo viaje abierto, la siguiente llegada escaneada (antes de que la
      // primera sincronizara) recibía EL MISMO viaje — la segunda llegada
      // pisaba a la primera, dejando la otra salida huérfana y produciendo
      // "NO SE ENCONTRO UNA SALIDA ABIERTA" al sincronizar. Con 2+ candidatos
      // no se elige ninguno: la llegada se guarda sin atarse a un viaje, y el
      // motor de emparejamiento por menor diferencia de tiempo (que sí ve el
      // conjunto completo) decide después.
      //
      // Incluye PENDIENTE_EMPAREJAMIENTO, que antes quedaba fuera. Ese estado
      // no es terminal — es "salida abierta hace rato".
      // Solo salidas dentro del techo de emparejamiento: ofrecer una de días
      // atrás hacía que la llegada de hoy se pegara a ella.
      const activeTransports = await this.prisma.transportTrip.findMany({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'] as any },
          arrival: null,
          posibleDuplicado: false,
          departureAt: { gte: this.pisoDeSalidasAbiertas() },
        },
        include: TRIP_FULL_INCLUDE,
        orderBy: { departureAt: 'desc' },
        take: 2,
      });
      const activeTransport =
        activeTransports.length === 1 ? activeTransports[0] : null;
      const ambiguous = activeTransports.length > 1;

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

      if (ambiguous) {
        // Sin `transportId` ni `data`: el cliente (rama OBRA de
        // manejarNavegacion en la app) ya trata esta forma exactamente igual
        // que "no se encontró ninguna salida" — aviso no bloqueante, la
        // llegada se guarda sin atarse a un viaje. No hace falta un caso
        // nuevo en el cliente, se reusa el camino que ya existe y funciona.
        return {
          action: 'CONTINUE_TO_ARRIVAL',
          ambiguous: true,
          vehicle: vehiclePayload,
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
    // Sin fotos el interceptor puede no mandar nada: ya no es motivo de rechazo.
    files = files ?? {};
    try {
      // Solo lo manda el registro manual del panel web — la app móvil real
      // nunca lo envía, así que su flujo sigue exigiendo la foto igual que hoy.
      const isManual = data.manual === 'true' || data.manual === true;

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
        include: { roleRef: true },
      });

      if (!user) {
        throw new BusinessException(
          'USER_NOT_FOUND',
          'EL USUARIO NO EXISTE',
          false,
          404,
        );
      }

      if (!['SUPERVISOR', 'ADMIN'].includes(user.roleRef.name)) {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'USTED NO TIENE PERMISO PARA REGISTRAR UNA SALIDA',
          false,
          400,
        );
      }
      // Mismo criterio que ya usa submitArrival para este caso: un ADMIN no
      // tiene roletype (eso solo distingue OBRA/CANTERA dentro de SUPERVISOR).
      const userRoleType =
        user.roleRef.name === 'ADMIN' ? 'ADMIN' : user.roletype || 'CANTERA';

      // --- Resolver vehículo: por vehicleId o por qrcode (alternativa offline) ---
      // La app manda 0 cuando no tiene el dato: cuenta como vacío.
      let vehicleId = this.idPositivo(data.vehicleId) ?? NaN;
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
      const planningId = this.idPositivo(data.planningId);
      let materialId = data.materialId ? parseInt(data.materialId) : null;

      // Lo que viene de la app no se rechaza por estas validaciones: un rechazo
      // deja el registro atrapado en el celular para siempre. Se guarda y se
      // marca para que un ADMIN lo revise. El registro manual web sí rechaza.
      const motivos: string[] = [];
      let posibleDuplicado = false;
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
        if (isManual) {
          throw new BusinessException(
            'VEHICLE_INACTIVE',
            'EL VEHICULO ESTA INACTIVO',
            false,
            422,
          );
        }
        motivos.push('Vehículo inactivo');
      }

      if (vehicle.ownerId) {
        const owner = await this.prisma.owner.findUnique({
          where: { id: vehicle.ownerId },
        });
        if (!owner || !owner.isActive) {
          if (isManual) {
            throw new BusinessException(
              'OWNER_INACTIVE',
              'EL PROPIETARIO DEL VEHICULO ESTA INACTIVO',
              false,
              422,
            );
          }
          motivos.push('Propietario inactivo');
        }
      } else if (!vehicle.company) {
        if (isManual) {
          throw new BusinessException(
            'VEHICLE_WITHOUT_OWNER_OR_COMPANY',
            'EL VEHICULO NO TIENE PROPIETARIO O COMPAÑÍA ASIGNADA',
            false,
            422,
          );
        }
        motivos.push('Vehículo sin propietario ni compañía');
      }

      if (materialId) {
        const material = await this.prisma.material.findUnique({
          where: { id: materialId },
        });
        if (!material) {
          if (isManual) {
            throw new BusinessException(
              'MATERIAL_NOT_FOUND',
              'EL MATERIAL NO EXISTE',
              false,
              404,
            );
          }
          motivos.push(`Material inexistente (id ${materialId})`);
          materialId = null;
        }
      }

      // --- Cliente y obra: los de la planificación; sin ella, los enviados ---
      let clientId: number;
      let constSiteId: number;
      let resolvedPlanningId = planningId;

      let planning = resolvedPlanningId
        ? await this.prisma.planning.findUnique({
            where: { id: resolvedPlanningId },
          })
        : null;

      if (resolvedPlanningId && !planning) {
        if (isManual) {
          throw new BusinessException(
            'PLANNING_NOT_FOUND',
            'LA PLANIFICACIÓN NO EXISTE',
            false,
            404,
          );
        }
        // Desde la app no se rechaza: se usa la planificación del vehículo.
        motivos.push(`Planificación inexistente (id ${resolvedPlanningId})`);
        resolvedPlanningId = null;
      }

      if (!planning) {
        const pv = await this.prisma.planningVehicle.findFirst({
          where: { vehicleId },
          include: { planning: true },
        });
        if (pv) {
          planning = pv.planning;
          resolvedPlanningId = pv.planningId;
        }
      }

      if (planning) {
        clientId = planning.clientId;
        constSiteId = planning.constSiteId;
      } else {
        // Sin planificación: cliente y obra enviados, solo si existen.
        const clienteEnviado = this.idPositivo(data.clientId);
        const obraEnviada = this.idPositivo(data.constSiteId);
        const [cliente, obra] = await Promise.all([
          clienteEnviado
            ? this.prisma.client.findUnique({ where: { id: clienteEnviado } })
            : null,
          obraEnviada
            ? this.prisma.constSite.findUnique({ where: { id: obraEnviada } })
            : null,
        ]);
        if (!cliente || !obra) {
          this.logger.error(
            `Salida sin cliente/obra | ${this.resumenEnvioSalida(uuid, data)}`,
          );
          // Reintentable: entra sola cuando el vehículo se agregue a una planificación.
          throw new BusinessException(
            'CLIENT_OR_SITE_NOT_FOUND',
            `EL VEHÍCULO ${vehicle.plate} NO ESTÁ EN NINGUNA PLANIFICACIÓN Y NO TRAE CLIENTE Y OBRA VÁLIDOS`,
            true,
            422,
          );
        }
        clientId = cliente.id;
        constSiteId = obra.id;
      }

      // El registro manual no exige foto; en la app su falta queda marcada.
      if (!isManual && (!files?.material || files.material.length < 1)) {
        motivos.push('Sin foto del material');
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
            status: { not: 'CANCELADO' },
            departureAt: {
              gte: new Date(capturedAt.getTime() - guardMs),
              lte: new Date(capturedAt.getTime() + guardMs),
            },
          },
          orderBy: { departureAt: 'desc' },
        });
        if (salidaCercana) {
          if (isManual) {
            throw new BusinessException(
              'DUPLICATE_DEPARTURE_WINDOW',
              `YA EXISTE UNA SALIDA DE ESTE VEHÍCULO A LAS ${this.formatFechaHora(salidaCercana.departureAt)}. NO SE PUEDE REGISTRAR OTRA DENTRO DE ${DUPLICATE_GUARD_MIN} MINUTOS.`,
              false,
              409,
            );
          }
          // Desde la app se guarda igual: rechazarla la dejaría atrapada en el
          // celular. Un ADMIN decide si es duplicado o una vuelta real.
          posibleDuplicado = true;
          motivos.push(
            `Posible duplicado de la salida de las ${this.formatHora(salidaCercana.departureAt)} (viaje #${salidaCercana.id})`,
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
        const codigo = await siguienteCodigoViaje(prisma, capturedAt);
        const trip = await prisma.transportTrip.create({
          data: {
            uuid,
            codigo,
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
            motivoRevision: motivos.length ? motivos.join(' · ') : null,
            posibleDuplicado,
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
      // Error inesperado: deja lo recibido para poder diagnosticarlo.
      if (!(error instanceof BusinessException)) {
        this.logger.error(
          `Salida fallida | ${this.resumenEnvioSalida(data?.uuid, data)}`,
        );
      }
      throw error;
    }
  }

  /** Id numérico mayor a 0, o null (la app manda 0 cuando no tiene el dato). */
  private idPositivo(valor: any): number | null {
    const n = parseInt(valor);
    return n > 0 ? n : null;
  }

  /** Ids que mandó la app en una salida, para los logs de error. */
  private resumenEnvioSalida(uuid: any, data: any): string {
    return (
      `uuid: ${uuid} | vehicleId: ${data?.vehicleId} | qrcode: ${data?.qrcode} | ` +
      `planningId: ${data?.planningId} | clientId: ${data?.clientId} | ` +
      `constSiteId: ${data?.constSiteId} | capturedAt: ${data?.capturedAt}`
    );
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
    files = files ?? {};
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userArrivalId },
        include: { roleRef: true },
      });
      if (!user)
        throw new BusinessException(
          'USER_NOT_FOUND',
          'USUARIO NO ENCONTRADO',
          false,
          404,
        );

      const userRoleType =
        user.roleRef.name === 'ADMIN' ? 'ADMIN' : user.roletype || 'OBRA';

      // Solo lo manda el registro manual del panel web — la app móvil real
      // (y el escaneo de QR de venta, que también cae acá) nunca lo envía.
      const isManual = data.manual === 'true' || data.manual === true;

      // Lo que viene de la app no se rechaza por validaciones de negocio: un
      // rechazo deja el registro atrapado en el celular para siempre. Se guarda
      // y queda marcado para revisión. El registro manual web sí rechaza.
      const motivos: string[] = [];
      if (!isManual && (!files?.material || files.material.length < 1)) {
        motivos.push('Sin foto del material');
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

      const capturedAt = data.capturedAt
        ? new Date(data.capturedAt)
        : new Date();
      this.validateCapturedAt(capturedAt);

      // Vehículo del QR escaneado. Null si el QR ya no corresponde a ninguno
      // (reasignado o desvinculado después de escanear sin conexión).
      let vehiculoDelQr: number | null = null;
      if (qrcode) {
        const vehicleQRCode = await this.prisma.vehicleQRCode.findUnique({
          where: { qrcode },
          include: { vehicle: true },
        });
        vehiculoDelQr = vehicleQRCode?.vehicle?.id ?? null;
      }

      let vehicleId: number | null = null;
      // Motivos que obligan a dejarla para un ADMIN, sin emparejar sola.
      const enRevision: string[] = [];

      if (tripId) {
        // Solo la usa el registro manual web / legacy: el ADMIN eligió el viaje.
        const transport = await this.prisma.transportTrip.findUnique({
          where: { id: tripId },
          select: { vehicleId: true },
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
      } else if (departureUuid) {
        const transport = await this.prisma.transportTrip.findUnique({
          where: { uuid: departureUuid },
          include: { arrival: { select: { id: true } } },
        });

        if (!transport) {
          vehicleId = vehiculoDelQr;
          enRevision.push('La salida indicada aún no llegó al servidor');
        } else if (transport.arrival) {
          // Reintento de esta misma llegada, u otra que cerró el viaje antes:
          // lo resuelve la transacción (idempotencia o staging).
          vehicleId = transport.vehicleId;
          tripId = transport.id;
        } else {
          const descarte = this.motivoParaNoUsarViaje(
            transport,
            vehiculoDelQr,
            capturedAt,
          );
          if (descarte) {
            // La app indicó una salida que no corresponde (vieja, de otro
            // vehículo...): se ignora y se busca por el vehículo escaneado.
            this.logger.warn(
              `Llegada ${clientUuid}: se ignora la salida indicada (viaje ${transport.id}) — ${descarte}`,
            );
            vehicleId = vehiculoDelQr;
          } else {
            vehicleId = transport.vehicleId;
            tripId = transport.id;
          }
        }
      } else {
        vehicleId = vehiculoDelQr;
      }

      if (vehicleId == null && enRevision.length === 0) {
        enRevision.push(`QR no reconocido: ${qrcode ?? 'sin QR'}`);
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
      // Material elegido por el supervisor de obra al registrar la llegada.
      // Puramente informativo/auditoría (ver comentario en el schema): no se
      // usa para nada operativo, así que un valor inválido se ignora en vez de
      // rechazar la llegada entera por un dato que no es crítico.
      let arrivalMaterialId: number | null = data.materialId
        ? parseInt(data.materialId)
        : null;
      // Un id inválido haría fallar el guardado por la clave foránea, y la app
      // reintentaría para siempre por un dato que no es crítico.
      if (arrivalMaterialId != null) {
        const existe = Number.isInteger(arrivalMaterialId)
          ? await this.prisma.material.findUnique({
              where: { id: arrivalMaterialId },
              select: { id: true },
            })
          : null;
        if (!existe) arrivalMaterialId = null;
      }

      if (isNaN(arrivalLat) || isNaN(arrivalLng) || isNaN(arrivalM3)) {
        throw new BusinessException(
          'VALIDATION_ERROR',
          'DATOS DE LLEGADA INVÁLIDOS',
          false,
          400,
        );
      }

      // Guard anti-duplicado, espejo del de submitDeparture. Se comprueban las
      // dos tablas: una llegada puede haber quedado como TransportArrival (si
      // encontró su salida) o en staging (si no).
      if ((data.source as string) !== 'MIGRATED' && vehicleId != null) {
        const guardMs = DUPLICATE_GUARD_MIN * 60_000;
        const desde = new Date(capturedAt.getTime() - guardMs);
        const hasta = new Date(capturedAt.getTime() + guardMs);

        const [llegadaCercana, pendienteCercana] = await Promise.all([
          this.prisma.transportArrival.findFirst({
            where: {
              capturedAt: { gte: desde, lte: hasta },
              trip: { vehicleId, status: { not: 'CANCELADO' } },
            },
          }),
          this.prisma.transportArrivalPending.findFirst({
            where: {
              vehicleId,
              capturedAt: { gte: desde, lte: hasta },
              status: { notIn: ['EMPAREJADO', 'DESCARTADO'] },
            },
          }),
        ]);

        const yaRegistrada = llegadaCercana ?? pendienteCercana;
        if (yaRegistrada) {
          if (isManual) {
            throw new BusinessException(
              'DUPLICATE_ARRIVAL_WINDOW',
              `YA EXISTE UNA LLEGADA DE ESTE VEHÍCULO A LAS ${this.formatFechaHora(yaRegistrada.capturedAt)}. NO SE PUEDE REGISTRAR OTRA DENTRO DE ${DUPLICATE_GUARD_MIN} MINUTOS.`,
              false,
              409,
            );
          }
          enRevision.push(
            `Posible duplicado de la llegada de las ${this.formatHora(yaRegistrada.capturedAt)}`,
          );
        }
      }

      let createdNewArrival = false;
      let pendingStaged = false;

      // Compartido por todas las ramas que terminan en staging. El vehículo es
      // el escaneado: si la app indicó un viaje de otro vehículo, la llegada
      // pertenece al del QR, no al de ese viaje.
      const pendingArrivalData: Prisma.TransportArrivalPendingUncheckedCreateInput =
        {
          clientUuid,
          source: data.source || 'ONLINE',
          capturedAt,
          vehicleId: vehiculoDelQr ?? vehicleId,
          motivoRevision: motivos.length ? motivos.join(' · ') : null,
          departureUuid: departureUuid ?? null,
          qrcode: qrcode ?? null,
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
          materialId: arrivalMaterialId,
          ...photos,
        };

      if (enRevision.length > 0) {
        // EN_REVISION: el emparejamiento automático no la toma; la resuelve un
        // ADMIN desde el panel de conciliación.
        await this.prisma.transportArrivalPending.create({
          data: {
            ...pendingArrivalData,
            status: 'EN_REVISION',
            motivoRevision: [...enRevision, ...motivos].join(' · '),
          },
        });
        this.logger.warn(
          `Llegada ${clientUuid} guardada para revisión | vehicleId: ${pendingArrivalData.vehicleId ?? 'desconocido'} | ${enRevision.join(' · ')}`,
        );
        return {
          success: true,
          pendingMatch: true,
          message: 'Llegada registrada, pendiente de revisión',
          data: null,
        };
      }

      // Desde acá el vehículo está identificado (si no, entró en revisión arriba).
      const vehiculoLlegada = vehicleId as number;

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
          //
          // La ventana está acotada por los DOS lados. El piso
          // (MAX_MATCH_GAP_HOURS) es el que faltaba: sin él, una salida vieja
          // que quedó abierta era la única candidata del vehículo y esta
          // consulta la elegía igual. El 07/09/2026 eso emparejó llegadas de
          // ese día con salidas del 04/09 — tres días, imposible para un viaje
          // que dura horas. Sin candidata dentro de la ventana, la llegada cae
          // en la rama de staging de abajo y la resuelve un ADMIN.
          const pisoDeBusqueda = new Date(
            capturedAt.getTime() - MAX_MATCH_GAP_HOURS * 60 * 60 * 1000,
          );
          // Prisma manda los Date como timestamptz, pero la columna guarda la
          // hora UTC sin zona: sin pasarlos a UTC, Postgres compara con la zona
          // de la sesión y corre la ventana (en UTC-5 solo veía salidas de
          // 5 a 17 h antes, nunca la correcta).
          const claimResult = await prisma.$queryRaw<
            { id: number; departureAt: Date }[]
          >`
            SELECT id, "departureAt" FROM "TransportTrip"
            WHERE "vehicleId" = ${vehiculoLlegada}
              AND status IN ('EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO')
              AND "posibleDuplicado" = false
              AND "departureAt" < (${capturedAt}::timestamptz AT TIME ZONE 'UTC')
              AND "departureAt" >= (${pisoDeBusqueda}::timestamptz AT TIME ZONE 'UTC')
            ORDER BY "departureAt" DESC
            LIMIT 2
            FOR UPDATE
          `;

          if (claimResult.length === 0) {
            // No hay salida abierta anterior de este vehículo TODAVÍA — puede
            // seguir offline en el otro celular. Ya no se rechaza (antes: 409
            // NO_OPEN_DEPARTURE): se guarda en staging y se resuelve después,
            // cuando la salida sincronice (disparador 1) o por el job
            // periódico (disparador 3).
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
          if (trip.arrival.clientUuid === clientUuid) {
            // Reintento idempotente: esta misma llegada ya se guardó antes.
            this.cleanupFiles(files);
            return trip;
          }

          // Es una llegada DISTINTA (otro clientUuid) y el viaje ya se cerró
          // con otra — perdió la carrera, típicamente porque el
          // emparejamiento automático (u otro dispositivo) llegó primero.
          // Antes acá se descartaban las fotos y se respondía éxito sin
          // guardar nada: el dato se perdía para siempre
          // Ahora va a staging, igual que cuando nunca hubo candidato —
          // el barrido o un ADMIN la resuelve después.
          await prisma.transportArrivalPending.create({
            data: pendingArrivalData,
          });
          pendingStaged = true;
          return null;
        }

        // PENDIENTE_EMPAREJAMIENTO se acepta: es una salida abierta que lleva
        // rato esperando su llegada, no un viaje cerrado. La búsqueda de
        // arriba lo elige a propósito, así que rechazarlo acá anularía el
        // cambio. (La rama por tripId explícito puede traer cualquier estado,
        // de ahí que la comprobación siga existiendo.)
        if (
          !['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'].includes(trip.status)
        ) {
          if (isManual) {
            throw new BusinessException(
              'TRIP_ALREADY_CLOSED',
              'EL VIAJE YA POSEE LLEGADA REGISTRADA',
              false,
              409,
            );
          }
          // El viaje se cerró o anuló entre la validación y este punto: la
          // llegada de la app no se rechaza, queda para revisión.
          await prisma.transportArrivalPending.create({
            data: {
              ...pendingArrivalData,
              status: 'EN_REVISION',
              motivoRevision: [
                `El viaje #${trip.id} ya no estaba abierto (${trip.status})`,
                ...motivos,
              ].join(' · '),
            },
          });
          pendingStaged = true;
          return null;
        }

        const departureM3Effective = data.departureM3Corrected
          ? parseFloat(data.departureM3Corrected)
          : trip.departure.m3;

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
            ...(motivos.length > 0 && {
              motivoRevision: [trip.motivoRevision, ...motivos]
                .filter(Boolean)
                .join(' · '),
            }),
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
                source: data.source || 'ONLINE',
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
                materialId: arrivalMaterialId,
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
      include: { roleRef: true },
    });

    if (!user) {
      throw new NotFoundException(`EL USUARIO NO EXISTE`);
    }

    if (user.roleRef.name === 'ADMIN' || user.roleRef.name === 'JEFE_DE_OBRA') {
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
        include: { roleRef: true },
      });
      if (!user) throw new NotFoundException('EL USUARIO NO EXISTE');

      // La restricción existía solo en la UI: sin esto, cualquier usuario
      // autenticado (un chofer con su token) podía corregir los m³ de
      // cualquier viaje llamando la API directo. Se admiten los dos roles que
      // realmente usan la pantalla: el módulo de transporte (ADMIN) y el de
      // jefe de obra (JEFE_DE_OBRA, que además solo puede tocar viajes en
      // ALERTA — esa regla más fina sigue vigente unas líneas más abajo).
      if (!['ADMIN', 'JEFE_DE_OBRA'].includes(user.roleRef.name)) {
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
      if (user.roleRef.name === 'JEFE_DE_OBRA' && transport.status !== 'ALERTA') {
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
      const finalStatus = user.roleRef.name === 'ADMIN' ? 'REVISADO' : 'VALIDADO';

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

  /**
   * Corrige el material de un viaje ya registrado.
   *
   * El material lo elige el supervisor en el celular, a veces a las apuradas y
   * con un desplegable largo: equivocarse es fácil y hoy no había forma de
   * arreglarlo desde la web.
   *
   * No se restringe por estado (a diferencia de reasignar vehículo/chofer): el
   * material es un dato descriptivo del viaje, no afecta el emparejamiento ni la
   * desviación de m³, y un dato mal cargado tiene que poder corregirse aunque el
   * viaje ya esté revisado.
   *
   * El consumo de la cantera se mueve junto con el material — ver
   * `reubicarConsumoPorMaterial`. Si la cantera no declara el material nuevo, la
   * transacción entera se revierte y no queda nada a medias.
   */
  async updateMaterial(id: number, materialId: number, userId: number) {
    await this.assertRole(userId, ['ADMIN']);

    const transport = await this.prisma.transportTrip.findUnique({
      where: { id },
      select: { id: true, materialId: true, canteraId: true },
    });
    if (!transport) throw new NotFoundException('EL REGISTRO NO EXISTE');

    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, materialType: true },
    });
    if (!material) throw new NotFoundException('EL MATERIAL NO EXISTE');

    if (transport.materialId === materialId) {
      const sinCambios = await this.prisma.transportTrip.findUnique({
        where: { id },
        include: TRIP_FULL_INCLUDE,
      });
      return { success: true, data: flattenTrip(sinCambios!) };
    }

    const anterior = transport.materialId;

    const updated = await this.prisma.$transaction(async (prisma) => {
      await this.canteraStockService.reubicarConsumoPorMaterial(prisma, {
        tripId: id,
        canteraId: transport.canteraId,
        materialId,
      });

      return prisma.transportTrip.update({
        where: { id },
        data: {
          materialId,
          materialCorregidoPorId: userId,
          materialCorregidoEn: new Date(),
        },
        include: TRIP_FULL_INCLUDE,
      });
    });

    this.logger.log(
      `Material corregido | viaje ${id} | ${anterior ?? 'sin material'} -> ${materialId} (${material.materialType}) | por usuario ${userId}`,
    );

    return { success: true, data: flattenTrip(updated) };
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roleRef: true },
    });
    if (!user) throw new NotFoundException('EL USUARIO NO EXISTE');
    if (!allowedRoles.includes(user.roleRef.name)) {
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
      plate: r.vehicle?.plate ?? null,
      vehicleCode: r.vehicle?.vehicleid ?? null,
      motivoRevision: r.motivoRevision,
      qrcode: r.qrcode,
      departureUuid: r.departureUuid,
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
      userId,
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
    matchedByUserId?: number,
  ): Promise<boolean> {
    try {
      return await this.reconciliationService.closeTripWithPendingArrival(
        tripId,
        pendingArrivalId,
        matchedByUserId,
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

  private pisoDeSalidasAbiertas(): Date {
    return new Date(Date.now() - MAX_MATCH_GAP_HOURS * 60 * 60 * 1000);
  }

  /**
   * Por qué NO usar el viaje que indicó la app para esta llegada, o null si es
   * válido. La app puede traer un viaje viejo o de otro vehículo (catálogo
   * desactualizado, QR reasignado): pegarse a él sin revisar fue lo que unió
   * una llegada del 30/09 con una salida del 18/09.
   */
  private motivoParaNoUsarViaje(
    trip: {
      status: string;
      posibleDuplicado: boolean;
      vehicleId: number;
      departureAt: Date;
    },
    vehiculoDelQr: number | null,
    capturedAt: Date,
  ): string | null {
    if (!['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'].includes(trip.status)) {
      return `el viaje no está abierto (${trip.status})`;
    }
    if (trip.posibleDuplicado) return 'el viaje es un posible duplicado';
    if (vehiculoDelQr != null && trip.vehicleId !== vehiculoDelQr) {
      return `el viaje es de otro vehículo (${trip.vehicleId}, QR de ${vehiculoDelQr})`;
    }
    if (trip.departureAt >= capturedAt) {
      return 'la salida es posterior a la llegada';
    }
    const horas = (capturedAt.getTime() - trip.departureAt.getTime()) / 3_600_000;
    if (horas > MAX_MATCH_GAP_HOURS) {
      return `la salida es de hace ${Math.round(horas)} h (máximo ${MAX_MATCH_GAP_HOURS} h)`;
    }
    return null;
  }

  /** dd/MM HH:mm en hora de Ecuador: queda guardado en motivos que lee un ADMIN,
   *  así que no puede depender de la zona horaria del servidor. */
  private formatHora(fecha: Date): string {
    return fecha.toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  /** dd/MM/yyyy HH:mm en hora local, para mensajes de error legibles. */
  private formatFechaHora(fecha: Date): string {
    const dosDigitos = (n: number) => String(n).padStart(2, '0');
    return (
      `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)}/${fecha.getFullYear()}` +
      ` ${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
    );
  }

  /**
   * Resuelve una salida marcada como posible duplicado.
   * - Es duplicado: queda CANCELADO (no se borra), devuelve su stock de
   *   cantera y deja de contar en reportes y dashboard.
   * - No es duplicado: se quita la marca y vuelve al emparejamiento normal.
   */
  async resolverDuplicado(id: number, esDuplicado: boolean, userId: number) {
    await this.assertRole(userId, ['ADMIN']);

    const trip = await this.prisma.transportTrip.findUnique({
      where: { id },
      include: { vehicle: { include: { qrcode: true } } },
    });
    if (!trip) throw new NotFoundException('EL VIAJE NO EXISTE');
    if (!trip.posibleDuplicado) {
      throw new BusinessException(
        'NOT_FLAGGED_DUPLICATE',
        'ESTE VIAJE YA NO ESTÁ MARCADO COMO POSIBLE DUPLICADO. REFRESQUE LA LISTA.',
        false,
        409,
      );
    }

    const noteLine = `[${new Date().toISOString()}] ${
      esDuplicado
        ? 'Anulado como salida duplicada'
        : 'Confirmado como vuelta real (no es duplicado)'
    } (usuario ${userId})`;
    const observation = trip.observation
      ? `${trip.observation}\n${noteLine}`
      : noteLine;

    if (esDuplicado) {
      await this.prisma.$transaction(async (tx) => {
        await tx.transportTrip.update({
          where: { id },
          data: {
            status: 'CANCELADO' as any,
            posibleDuplicado: false,
            observation,
          },
        });
        await this.canteraStockService.anularConsumo(tx, id);

        // El QR queda libre solo si el vehículo no tiene otra salida abierta.
        if (trip.vehicle?.qrcode) {
          const otrasAbiertas = await tx.transportTrip.count({
            where: {
              vehicleId: trip.vehicleId,
              id: { not: id },
              status: { in: ['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'] },
              arrival: null,
            },
          });
          if (otrasAbiertas === 0) {
            await tx.vehicleQRCode.update({
              where: { id: trip.vehicle.qrcode.id },
              data: { status: 'DISPONIBLE' as any },
            });
          }
        }
      });

      // Aislado, igual que en unmatchTrip: la anulación ya quedó guardada.
      try {
        await this.dashboardService.decrementDepartureCount(trip.departureAt);
      } catch (error: any) {
        this.logger.error(
          `Viaje ${id} anulado, pero falló el contador de salidas del dashboard: ${error.message}. Corregible con recomputeDailyStats.`,
        );
      }
    } else {
      await this.prisma.transportTrip.update({
        where: { id },
        data: {
          posibleDuplicado: false,
          motivoRevision: this.quitarMotivoDuplicado(trip.motivoRevision),
          observation,
        },
      });
      await this.reconciliationService.tryMatchNewDeparture(id);
    }

    this.logger.log(
      `Viaje ${id} ${esDuplicado ? 'anulado como duplicado' : 'confirmado como no duplicado'} por usuario ${userId}`,
    );

    const updated = await this.prisma.transportTrip.findUnique({
      where: { id },
      include: TRIP_FULL_INCLUDE,
    });
    return { success: true, data: updated ? flattenTrip(updated) : null };
  }

  /** Quita la marca de revisión de un viaje ya revisado por un ADMIN. */
  async marcarRevisado(id: number, userId: number) {
    await this.assertRole(userId, ['ADMIN']);

    const trip = await this.prisma.transportTrip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('EL VIAJE NO EXISTE');
    if (trip.posibleDuplicado) {
      throw new BusinessException(
        'PENDING_DUPLICATE_DECISION',
        'PRIMERO INDIQUE SI ESTA SALIDA ES DUPLICADA O NO (PANEL DE CONCILIACIÓN)',
        false,
        409,
      );
    }
    if (!trip.motivoRevision) {
      return { success: true, data: null };
    }

    const noteLine = `[${new Date().toISOString()}] Revisado (usuario ${userId}): ${trip.motivoRevision}`;
    const updated = await this.prisma.transportTrip.update({
      where: { id },
      data: {
        motivoRevision: null,
        observation: trip.observation
          ? `${trip.observation}\n${noteLine}`
          : noteLine,
      },
      include: TRIP_FULL_INCLUDE,
    });
    return { success: true, data: flattenTrip(updated) };
  }

  /** Descarta una llegada pendiente (ej. duplicado confirmado). No se borra. */
  async descartarLlegadaPendiente(id: number, reason: string, userId: number) {
    await this.assertRole(userId, ['ADMIN']);

    const pending = await this.prisma.transportArrivalPending.findUnique({
      where: { id },
    });
    if (!pending) throw new NotFoundException('LA LLEGADA PENDIENTE NO EXISTE');

    const noteLine = `[${new Date().toISOString()}] Descartada (usuario ${userId}). Motivo: ${reason.trim()}`;
    // Condicional al estado: si otro proceso la emparejó mientras tanto, no se toca.
    const { count } = await this.prisma.transportArrivalPending.updateMany({
      where: {
        id,
        status: { in: ['PENDIENTE', 'EXPIRADO', 'EN_REVISION'] },
      },
      data: {
        status: 'DESCARTADO',
        observation: pending.observation
          ? `${pending.observation}\n${noteLine}`
          : noteLine,
      },
    });
    if (count === 0) {
      throw new BusinessException(
        'PENDING_NOT_AVAILABLE',
        'ESA LLEGADA YA FUE EMPAREJADA O DESCARTADA. REFRESQUE LA LISTA.',
        false,
        409,
      );
    }

    this.logger.log(
      `Llegada pendiente ${id} descartada por usuario ${userId}. Motivo: ${reason.trim()}`,
    );
    return { success: true };
  }

  private quitarMotivoDuplicado(motivo: string | null): string | null {
    if (!motivo) return null;
    const resto = motivo
      .split(' · ')
      .filter((parte) => !parte.startsWith('Posible duplicado'));
    return resto.length ? resto.join(' · ') : null;
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
      // Viajes abiertos recientes: permiten que OBRA resuelva "viaje activo" al
      // escanear el QR de llegada sin conexión (ver CachedOpenTrip en la app).
      // Mismo criterio que getByQrCode.
      this.prisma.transportTrip.findMany({
        where: {
          status: { in: ['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'] as any },
          arrival: null,
          posibleDuplicado: false,
          departureAt: { gte: this.pisoDeSalidasAbiertas() },
        },
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
