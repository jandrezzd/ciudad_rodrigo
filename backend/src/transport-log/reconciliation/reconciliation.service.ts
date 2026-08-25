import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { TRIP_FULL_INCLUDE } from '../flatten-trip';
import {
  EARLY_TOLERANCE_MIN,
  LATE_TOLERANCE_MIN,
  LUNCH_DURATION_MIN,
  PENDING_ARRIVAL_EXPIRATION_DAYS,
} from './reconciliation.constants';

/**
 * Emparejamiento de salidas y llegadas registradas offline por dos supervisores
 * distintos (cantera y obra), en celulares distintos, que sincronizan en
 * cualquier orden. Une por placa + ventana de tiempo derivada de
 * Planning.tiempoPromedioViajeMin, nunca por distanciaAproximadaKm (solo
 * informativa).
 *
 * Tres disparadores (ver plan 1.2):
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
  ) {}

  /**
   * Ventana de llegada esperada para una salida: [esperado - 10min, esperado + 25min],
   * restando 1h de almuerzo del tiempo de viaje cuando aplicó.
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
      if (!trip || trip.planning?.tiempoPromedioViajeMin == null) return;

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

      if (candidates.length === 0) return;
      if (candidates.length > 1) {
        this.logger.warn(
          `Viaje ${tripId}: ${candidates.length} llegadas pendientes caen en su ventana esperada, se deja para revisión manual`,
        );
        return;
      }

      await this.closeTripWithPendingArrival(tripId, candidates[0].id);
    } catch (error: any) {
      this.logger.error(
        `Error emparejando salida nueva (trip ${tripId}): ${error.message}`,
      );
    }
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

    await this.prisma.$transaction(async (tx) => {
      // Reclamo atómico: si otro proceso (job periódico vs. este mismo
      // disparador, o un reintento del emparejamiento manual) ya la tomó, el
      // count da 0 y no seguimos. EXPIRADO se acepta acá porque el
      // emparejamiento MANUAL (plan 1.3) puede revivir llegadas viejas; el
      // automático nunca pasa un id EXPIRADO porque sus propias búsquedas de
      // candidatos ya filtran status='PENDIENTE'.
      const claim = await tx.transportArrivalPending.updateMany({
        where: {
          id: pendingArrivalId,
          status: { in: ['PENDIENTE', 'EXPIRADO'] },
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
      if (
        !trip ||
        !['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'].includes(trip.status) ||
        trip.arrival ||
        !trip.departure
      ) {
        // Deja la excepción explícita para que la transacción entera se
        // revierta, incluido el reclamo de arriba: la fila pendiente vuelve
        // a quedar disponible para el siguiente intento.
        throw new Error(
          `Trip ${tripId} ya no es elegible para emparejar (status=${trip?.status}, arrival=${!!trip?.arrival})`,
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
        include: TRIP_FULL_INCLUDE,
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
    });

    if (closed) {
      await this.dashboardService.incrementArrivalCount();
      this.logger.log(
        `Viaje ${tripId} emparejado automáticamente con llegada pendiente ${pendingArrivalId}`,
      );
    }

    return closed;
  }

  /**
   * Disparador 3: cubre el caso "la llegada sincronizó antes que la salida" y
   * cualquier condición de carrera entre 1 y 2. También marca PENDIENTE_EMPAREJAMIENTO
   * los trips cuya ventana ya cerró sin match (sin dejar de reintentarlos
   * después), y EXPIRADO los pendientes muy viejos (solo informativo).
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
          await this.closeTripWithPendingArrival(trip.id, candidates[0].id);
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
}
