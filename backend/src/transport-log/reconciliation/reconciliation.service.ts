import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { BusinessException } from '../../common/business.exception';
import {
  EARLY_TOLERANCE_MIN,
  LATE_TOLERANCE_MIN,
  LUNCH_DURATION_MIN,
  OPEN_TRIP_ATTENTION_HOURS,
  PENDING_ARRIVAL_EXPIRATION_DAYS,
  RECONCILIATION_MODE,
  TIE_MARGIN_MIN,
} from './reconciliation.constants';
import { computeGreedyMatches, groupBy } from './reconciliation.matching';

/**
 * Emparejamiento de salidas y llegadas registradas offline por dos supervisores
 * distintos (cantera y obra), en celulares distintos, que sincronizan en
 * cualquier orden. Une por vehículo + cercanía en el tiempo, nunca por
 * distanciaAproximadaKm (solo informativa).
 *
 * Convive con DOS criterios de selección durante la transición, elegidos por
 * RECONCILIATION_MODE (ver reconciliation.constants.ts):
 * - `window` (viejo): ventana derivada de Planning.tiempoPromedioViajeMin.
 * - `gap` (nuevo): menor diferencia de tiempo, con causalidad llegada > salida.
 * - `shadow` (default): empareja con el viejo y calcula el nuevo en solo
 *   lectura, registrando divergencias para poder medir el cambio antes de
 *   activarlo.
 *
 * Tres disparadores:
 * 1. tryMatchNewDeparture: al crear una salida, busca una llegada ya en staging.
 * 2. submitArrival hace el staging cuando no encuentra salida abierta (no está
 *    en este archivo, vive en transport-log.service.ts).
 * 3. runReconciliationSweep: job periódico, cubre el caso "la llegada
 *    sincronizó antes que la salida" y las condiciones de carrera entre 1 y 2.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private prisma: PrismaService,
    private dashboardService: DashboardService,
  ) {
    this.logger.log(
      `Emparejamiento automático en modo "${RECONCILIATION_MODE}" (empate ${TIE_MARGIN_MIN} min, atención ${OPEN_TRIP_ATTENTION_HOURS} h)`,
    );
  }

  /**
   * Ventana de llegada esperada para una salida: [esperado - 10min, esperado + 25min],
   * restando 1h de almuerzo del tiempo de viaje cuando aplicó.
   *
   * Solo la usan los modos `window` y `shadow`. Se elimina junto con esos modos
   * cuando `gap` quede fijo.
   */
  computeExpectedWindow(
    departureAt: Date,
    tiempoPromedioViajeMin: number,
    almuerzoAplicado: boolean,
  ): { start: Date; end: Date } {
    const travelMin = almuerzoAplicado
      ? Math.max(tiempoPromedioViajeMin - LUNCH_DURATION_MIN, 0)
      : tiempoPromedioViajeMin;
    const expected = new Date(departureAt.getTime() + travelMin * 60_000);
    return {
      start: new Date(expected.getTime() - EARLY_TOLERANCE_MIN * 60_000),
      end: new Date(expected.getTime() + LATE_TOLERANCE_MIN * 60_000),
    };
  }

  /**
   * Disparador 1: se llama DESPUÉS de que submitDeparture ya confirmó la
   * salida (fuera de esa transacción, en su propio try/catch por fuera de
   * esta función) — un fallo acá nunca debe hacer perder una salida ya
   * registrada, mismo principio que CanteraStockService ("nunca rechaza un
   * despacho").
   */
  async tryMatchNewDeparture(tripId: number): Promise<void> {
    try {
      const trip = await this.prisma.transportTrip.findUnique({
        where: { id: tripId },
        include: { planning: true },
      });
      if (!trip) return;

      const porVentana = await this.candidatoPorVentana(trip);
      const porGap = await this.candidatoPorMenorGap(trip);

      if (RECONCILIATION_MODE === 'shadow' && porVentana !== porGap) {
        this.logger.warn(
          `[SHADOW] trip=${tripId} vehiculo=${trip.vehicleId} salida=${trip.departureAt.toISOString()} viejo=${porVentana ?? 'ninguno'} nuevo=${porGap ?? 'ninguno'}`,
        );
      }

      const elegido = RECONCILIATION_MODE === 'gap' ? porGap : porVentana;
      if (elegido == null) return;

      await this.closeTripWithPendingArrival(tripId, elegido);
    } catch (error: any) {
      this.logger.error(
        `Error emparejando salida nueva (trip ${tripId}): ${error.message}`,
      );
    }
  }

  /** Criterio viejo: exactamente 1 llegada pendiente dentro de la ventana. */
  private async candidatoPorVentana(trip: {
    id: number;
    vehicleId: number;
    departureAt: Date;
    almuerzoAplicado: boolean;
    planning?: { tiempoPromedioViajeMin: number | null } | null;
  }): Promise<number | null> {
    if (trip.planning?.tiempoPromedioViajeMin == null) return null;

    const window = this.computeExpectedWindow(
      trip.departureAt,
      trip.planning.tiempoPromedioViajeMin,
      trip.almuerzoAplicado,
    );

    const candidates = await this.prisma.transportArrivalPending.findMany({
      where: {
        vehicleId: trip.vehicleId,
        status: 'PENDIENTE',
        capturedAt: { gte: window.start, lte: window.end },
      },
      select: { id: true },
    });

    if (candidates.length === 0) return null;
    if (candidates.length > 1) {
      this.logger.warn(
        `Viaje ${trip.id}: ${candidates.length} llegadas pendientes caen en su ventana esperada, se deja para revisión manual`,
      );
      return null;
    }
    return candidates[0].id;
  }

  /**
   * Criterio nuevo: la llegada pendiente POSTERIOR más próxima. Se piden 2 para
   * poder detectar el empate — si las dos primeras están casi a la misma
   * distancia, elegir una sería adivinar.
   *
   * No depende de tiempoPromedioViajeMin, así que también cubre los viajes sin
   * planificación cargada, que con el criterio viejo nunca emparejaban.
   */
  private async candidatoPorMenorGap(trip: {
    id: number;
    vehicleId: number;
    departureAt: Date;
  }): Promise<number | null> {
    const candidates = await this.prisma.transportArrivalPending.findMany({
      where: {
        vehicleId: trip.vehicleId,
        status: 'PENDIENTE',
        capturedAt: { gt: trip.departureAt },
      },
      orderBy: { capturedAt: 'asc' },
      take: 2,
      select: { id: true, capturedAt: true },
    });

    if (candidates.length === 0) return null;

    if (candidates.length === 2) {
      const gap0 = candidates[0].capturedAt.getTime() - trip.departureAt.getTime();
      const gap1 = candidates[1].capturedAt.getTime() - trip.departureAt.getTime();
      if (gap1 - gap0 < TIE_MARGIN_MIN * 60_000) {
        this.logger.warn(
          `Viaje ${trip.id}: llegadas pendientes ${candidates[0].id} y ${candidates[1].id} casi empatadas, se deja para el barrido o revisión manual`,
        );
        return null;
      }
    }

    return candidates[0].id;
  }

  /**
   * Cierra un trip EN_PROGRESO con una llegada que estaba en staging. Reusado
   * por el disparador 1, el job periódico, y (en el plan 1.3, todavía no
   * implementado) el emparejamiento manual desde el portal web.
   *
   * Todo ocurre en una única transacción: si el trip ya no calza (ya tiene
   * llegada, ya no está abierto) o la fila pendiente ya fue tomada por otro
   * proceso, se revierte completo — no hay estado a medio aplicar.
   */
  async closeTripWithPendingArrival(
    tripId: number,
    pendingArrivalId: number,
  ): Promise<boolean> {
    let closed = false;
    let arrivalCapturedAt: Date | null = null;

    await this.prisma.$transaction(async (tx) => {
      // Reclamo atómico: si otro proceso (job periódico vs. este mismo
      // disparador, o un reintento del emparejamiento manual) ya la tomó, el
      // count da 0 y no seguimos. EXPIRADO y EN_REVISION se aceptan acá porque
      // el emparejamiento MANUAL puede revivir llegadas viejas o liberadas por
      // un desemparejamiento; el automático nunca pasa un id de esos dos
      // estados porque sus búsquedas de candidatos filtran status='PENDIENTE'.
      const claim = await tx.transportArrivalPending.updateMany({
        where: {
          id: pendingArrivalId,
          status: { in: ['PENDIENTE', 'EXPIRADO', 'EN_REVISION'] },
        },
        data: { status: 'EMPAREJADO' },
      });
      if (claim.count === 0) return;

      const pending = await tx.transportArrivalPending.findUniqueOrThrow({
        where: { id: pendingArrivalId },
      });

      const trip = await tx.transportTrip.findUnique({
        where: { id: tripId },
        include: {
          vehicle: { include: { qrcode: true } },
          departure: true,
          arrival: true,
        },
      });

      // PENDIENTE_EMPAREJAMIENTO es justamente el estado que este método
      // debe poder resolver (trip cuya ventana ya cerró sin match).
      //
      // Lanzar es deliberado: revierte la transacción entera, incluido el
      // reclamo de arriba, y la fila pendiente vuelve a quedar disponible para
      // el siguiente intento. Pero tiene que ser una BusinessException y no un
      // Error pelado: el emparejamiento manual llama a este método por HTTP, y
      // un Error sin tipar cae en la rama "excepción no controlada" del filtro
      // global y sale como 500 "Internal server error", sin decirle al ADMIN
      // qué pasó ni por qué su fila desapareció de la cola.
      if (!trip) {
        throw new BusinessException(
          'TRIP_NOT_ELIGIBLE',
          `EL VIAJE ${tripId} YA NO EXISTE`,
          false,
          409,
        );
      }
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
          `EL VIAJE ${tripId} NO TIENE SALIDA ASOCIADA, NO SE PUEDE EMPAREJAR`,
          false,
          422,
        );
      }

      // El clientUuid viaja de la fila de staging a TransportArrival, donde
      // también es UNIQUE. Si el móvil alcanzó a registrar la misma llegada por
      // las dos vías (carrera entre las comprobaciones de idempotencia de
      // submitArrival), quedó copia en ambas tablas y el create de abajo
      // reventaría con un P2002 crudo -> 500. Detectarlo acá permite decir qué
      // pasó y con qué viaje quedó emparejada realmente.
      const gemela = await tx.transportArrival.findUnique({
        where: { clientUuid: pending.clientUuid },
        select: { tripId: true },
      });
      if (gemela) {
        throw new BusinessException(
          'ARRIVAL_ALREADY_EXISTS',
          `ESTA LLEGADA YA ESTÁ REGISTRADA EN EL VIAJE ${gemela.tripId} (REGISTRO DUPLICADO DESDE EL CELULAR). NO SE PUEDE EMPAREJAR DE NUEVO.`,
          false,
          409,
        );
      }

      const departureM3Effective =
        trip.departure.m3Corrected ?? trip.departure.m3;
      const deviationM3 = pending.m3 - departureM3Effective;
      const finalStatus = Math.abs(deviationM3) >= 1 ? 'ALERTA' : 'COMPLETADO';
      const almuerzoAplicado = trip.almuerzoAplicado || pending.almuerzo;

      await tx.transportTrip.update({
        where: { id: tripId },
        data: {
          arrivalAt: pending.capturedAt,
          deviationM3,
          userArrivalId: pending.userId,
          status: finalStatus as any,
          initialStatus: finalStatus as any,
          almuerzoAplicado,
          arrival: {
            create: {
              clientUuid: pending.clientUuid,
              source: pending.source,
              capturedAt: pending.capturedAt,
              receivedAt: pending.receivedAt,
              userId: pending.userId,
              m3: pending.m3,
              m3Corrected: pending.m3Corrected,
              lat: pending.lat,
              lng: pending.lng,
              abscisa: pending.abscisa,
              almuerzo: pending.almuerzo,
              observation: pending.observation,
              driverPhoto: pending.driverPhoto,
              vehiclePhoto: pending.vehiclePhoto,
              platePhoto: pending.platePhoto,
              materialPhoto1: pending.materialPhoto1,
              materialPhoto2: pending.materialPhoto2,
            },
          },
        },
        // Sin include: el objeto completo se relee fuera de la transacción
        // cuando hace falta. Traer TRIP_FULL_INCLUDE (que anida
        // planning.canteras.cantera.materialProvider) alarga la transacción
        // sin que nadie use el resultado, y acerca el timeout de Prisma.
      });

      await tx.transportArrivalPending.update({
        where: { id: pendingArrivalId },
        data: { matchedTripId: tripId },
      });

      if (trip.vehicle?.qrcode) {
        await tx.vehicleQRCode.update({
          where: { id: trip.vehicle.qrcode.id },
          data: { status: 'DISPONIBLE' as any },
        });
      }

      closed = true;
      arrivalCapturedAt = pending.capturedAt;
      // El timeout por defecto de una transacción interactiva de Prisma son 5s.
      // Acá van 6 operaciones contra la BD; bajo latencia o carga eso se queda
      // corto y sale un P2028 crudo (otro 500 sin explicación).
    }, { timeout: 15_000 });

    if (closed) {
      // Fuera de la transacción y aislado: si las estadísticas fallan, el
      // emparejamiento YA está guardado. Dejar que la excepción suba haría
      // fallar la petición con un 500 sobre trabajo que sí se completó, y el
      // reintento del usuario chocaría contra "el viaje ya tiene llegada".
      try {
        // Con capturedAt: la llegada cuenta el día en que realmente ocurrió,
        // no el día en que alguien la emparejó (que puede ser semanas después).
        await this.dashboardService.incrementArrivalCount(
          arrivalCapturedAt ?? undefined,
        );
      } catch (error: any) {
        this.logger.error(
          `Viaje ${tripId} emparejado, pero falló el contador de llegadas del dashboard: ${error.message}. Corregible con recomputeDailyStats.`,
        );
      }
      this.logger.log(
        `Viaje ${tripId} emparejado con llegada pendiente ${pendingArrivalId}`,
      );
    }

    return closed;
  }

  /**
   * Disparador 3: cubre el caso "la llegada sincronizó antes que la salida" y
   * cualquier condición de carrera entre 1 y 2. También marca
   * PENDIENTE_EMPAREJAMIENTO las salidas que llevan demasiado tiempo abiertas
   * (sin dejar de reintentarlas después), y EXPIRADO los pendientes muy viejos
   * (solo informativo).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runReconciliationSweep(): Promise<void> {
    try {
      const openTrips = await this.prisma.transportTrip.findMany({
        where: {
          status: { in: ['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'] },
          arrival: null,
        },
        include: { planning: true },
      });

      const now = new Date();

      if (RECONCILIATION_MODE === 'gap') {
        await this.barrerPorMenorGap(openTrips);
      } else {
        await this.barrerPorVentana(openTrips, now);
        if (RECONCILIATION_MODE === 'shadow') {
          await this.compararConMenorGap(openTrips);
        }
      }

      await this.marcarSalidasSinAtender(now);

      const expirationCutoff = new Date(
        now.getTime() - PENDING_ARRIVAL_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
      );
      const expired = await this.prisma.transportArrivalPending.updateMany({
        where: { status: 'PENDIENTE', capturedAt: { lt: expirationCutoff } },
        data: { status: 'EXPIRADO' },
      });
      if (expired.count > 0) {
        this.logger.log(
          `${expired.count} llegada(s) pendiente(s) marcada(s) EXPIRADO por antigüedad (siguen emparejables a mano)`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Error en runReconciliationSweep: ${error.message}`);
    }
  }

  /** Barrido con el criterio viejo, viaje por viaje. */
  private async barrerPorVentana(openTrips: any[], now: Date): Promise<void> {
    for (const trip of openTrips) {
      if (trip.planning?.tiempoPromedioViajeMin == null) continue;

      const window = this.computeExpectedWindow(
        trip.departureAt,
        trip.planning.tiempoPromedioViajeMin,
        trip.almuerzoAplicado,
      );

      const candidates = await this.prisma.transportArrivalPending.findMany({
        where: {
          vehicleId: trip.vehicleId,
          status: 'PENDIENTE',
          capturedAt: { gte: window.start, lte: window.end },
        },
        select: { id: true },
      });

      if (candidates.length === 1) {
        await this.cerrarEnBarrido(trip.id, candidates[0].id);
        continue;
      }

      if (candidates.length > 1) {
        this.logger.warn(
          `Viaje ${trip.id}: ${candidates.length} llegadas pendientes en ventana, requiere revisión manual`,
        );
        continue;
      }

      if (trip.status === 'EN_PROGRESO' && now > window.end) {
        await this.prisma.transportTrip.update({
          where: { id: trip.id },
          data: { status: 'PENDIENTE_EMPAREJAMIENTO' as any },
        });
        this.logger.warn(
          `Viaje ${trip.id}: ventana esperada cerrada sin llegada, marcado PENDIENTE_EMPAREJAMIENTO`,
        );
      }
    }
  }

  /**
   * Barrido con el criterio nuevo. A diferencia del viejo, resuelve el conjunto
   * COMPLETO de cada vehículo de una vez en vez de viaje por viaje: mirando una
   * sola salida no se puede saber si la llegada que le queda más cerca le
   * corresponde a ella o a otra salida que le queda todavía más cerca.
   */
  private async barrerPorMenorGap(openTrips: any[]): Promise<void> {
    const pendingArrivals = await this.prisma.transportArrivalPending.findMany({
      where: { status: 'PENDIENTE' },
      select: { id: true, vehicleId: true, capturedAt: true },
    });

    const tripsPorVehiculo = groupBy(openTrips, (t: any) => t.vehicleId);
    const pendientesPorVehiculo = groupBy(pendingArrivals, (p) => p.vehicleId);

    for (const [vehicleId, trips] of tripsPorVehiculo) {
      const pendientes = pendientesPorVehiculo.get(vehicleId);
      if (!pendientes?.length) continue;

      const { matches, ambiguous } = computeGreedyMatches(
        trips.map((t: any) => ({ tripId: t.id, departureAt: t.departureAt })),
        pendientes.map((p) => ({
          pendingArrivalId: p.id,
          capturedAt: p.capturedAt,
        })),
        TIE_MARGIN_MIN * 60_000,
      );

      for (const { tripId, pendingArrivalId } of matches) {
        await this.cerrarEnBarrido(tripId, pendingArrivalId);
      }
      for (const amb of ambiguous) {
        this.logger.warn(
          `Vehículo ${vehicleId}: viaje ${amb.tripId} y llegada ${amb.pendingArrivalId} empatados (${amb.reason}), requieren revisión manual`,
        );
      }
    }
  }

  /**
   * Modo sombra: calcula lo que HARÍA el criterio nuevo, sin tocar nada, y
   * registra en qué difiere del viejo. Es la forma de medir el cambio contra la
   * operación real durante días antes de activarlo, en vez de descubrirlo en
   * producción el día del despliegue.
   */
  private async compararConMenorGap(openTrips: any[]): Promise<void> {
    const pendingArrivals = await this.prisma.transportArrivalPending.findMany({
      where: { status: 'PENDIENTE' },
      select: { id: true, vehicleId: true, capturedAt: true },
    });

    const tripsPorVehiculo = groupBy(openTrips, (t: any) => t.vehicleId);
    const pendientesPorVehiculo = groupBy(pendingArrivals, (p) => p.vehicleId);
    let totalMatches = 0;
    let totalAmbiguos = 0;

    for (const [vehicleId, trips] of tripsPorVehiculo) {
      const pendientes = pendientesPorVehiculo.get(vehicleId);
      if (!pendientes?.length) continue;

      const { matches, ambiguous } = computeGreedyMatches(
        trips.map((t: any) => ({ tripId: t.id, departureAt: t.departureAt })),
        pendientes.map((p) => ({
          pendingArrivalId: p.id,
          capturedAt: p.capturedAt,
        })),
        TIE_MARGIN_MIN * 60_000,
      );

      totalMatches += matches.length;
      totalAmbiguos += ambiguous.length;

      for (const m of matches) {
        const trip = trips.find((t: any) => t.id === m.tripId);
        const pend = pendientes.find((p) => p.id === m.pendingArrivalId);
        const gapMin =
          pend && trip
            ? Math.round(
                (pend.capturedAt.getTime() - trip.departureAt.getTime()) / 60_000,
              )
            : -1;
        this.logger.warn(
          `[SHADOW] vehiculo=${vehicleId} emparejaria trip=${m.tripId} con pending=${m.pendingArrivalId} gap=${gapMin}min (el criterio actual los dejó sin emparejar)`,
        );
      }
    }

    if (totalMatches > 0 || totalAmbiguos > 0) {
      this.logger.warn(
        `[SHADOW] resumen: ${totalMatches} emparejamiento(s) que el criterio nuevo habría hecho y el actual no, ${totalAmbiguos} empate(s)`,
      );
    }
  }

  /**
   * Señal de atención por antigüedad, independiente del criterio de
   * emparejamiento. Con el criterio viejo esto dependía de tener
   * `tiempoPromedioViajeMin` cargado: un viaje sin planificación nunca se
   * marcaba y quedaba EN_PROGRESO para siempre, invisible.
   *
   * No es terminal: PENDIENTE_EMPAREJAMIENTO se sigue intentando emparejar.
   */
  private async marcarSalidasSinAtender(now: Date): Promise<void> {
    const attentionCutoff = new Date(
      now.getTime() - OPEN_TRIP_ATTENTION_HOURS * 60 * 60 * 1000,
    );
    const flagged = await this.prisma.transportTrip.updateMany({
      where: {
        status: 'EN_PROGRESO',
        arrival: null,
        departureAt: { lt: attentionCutoff },
      },
      data: { status: 'PENDIENTE_EMPAREJAMIENTO' as any },
    });
    if (flagged.count > 0) {
      this.logger.warn(
        `${flagged.count} salida(s) marcada(s) PENDIENTE_EMPAREJAMIENTO por llevar más de ${OPEN_TRIP_ATTENTION_HOURS} h sin llegada`,
      );
    }
  }

  /**
   * try/catch por iteración: el barrido recorre TODOS los viajes abiertos del
   * sistema. Sin esto, un solo viaje inconsistente (llegada duplicada, salida
   * faltante) aborta la pasada entera y ningún otro viaje se empareja hasta que
   * alguien lo arregle a mano.
   */
  private async cerrarEnBarrido(
    tripId: number,
    pendingArrivalId: number,
  ): Promise<void> {
    try {
      await this.closeTripWithPendingArrival(tripId, pendingArrivalId);
    } catch (error: any) {
      this.logger.error(
        `Barrido: no se pudo emparejar el viaje ${tripId} con la llegada ${pendingArrivalId}: ${error.message}`,
      );
    }
  }
}
