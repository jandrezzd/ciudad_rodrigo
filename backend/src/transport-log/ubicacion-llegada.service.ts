import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  calcularUbicacionLlegada,
  parseFotosGps,
  ResultadoUbicacionLlegada,
} from './ubicacion-llegada';

const SELECT_REFERENCIA = {
  ubicacionLlegadaLat: true,
  ubicacionLlegadaLng: true,
  radioLlegadaM: true,
} satisfies Prisma.PlanningSelect;

/** Viajes que se recalculan en paralelo. */
const LOTE = 25;

/** Un Json nullable copiado de una fila a otra: null se escribe como DbNull. */
export function jsonODbNull(
  valor: Prisma.JsonValue | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return valor == null ? Prisma.DbNull : (valor as Prisma.InputJsonValue);
}

export function datosUbicacionCalculada(
  resultado: ResultadoUbicacionLlegada | null,
): Prisma.TransportArrivalUpdateInput {
  return {
    ubicacionLat: resultado?.lat ?? null,
    ubicacionLng: resultado?.lng ?? null,
    ubicacionPrecisionM: resultado?.precisionM ?? null,
    ubicacionDistanciaRefM: resultado?.distanciaReferenciaM ?? null,
    ubicacionDentroRadio: resultado?.dentroDelRadio ?? null,
    ubicacionDetalle: resultado
      ? ({
          metodo: resultado.metodo,
          aviso: resultado.aviso,
          radioM: resultado.radioM,
          lecturas: resultado.lecturas,
        } as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull,
    // Se marca aunque no haya lecturas válidas: así se distingue un viaje
    // "sin GPS" de uno que todavía no se calculó.
    ubicacionCalculadaEn: new Date(),
  };
}

/**
 * Calcula y guarda la "Ubicación de llegada más precisa" en TransportArrival.
 * Ningún método lanza: la llegada ya está guardada cuando se llama, y un fallo
 * de este cálculo no puede tumbar el registro ni el emparejamiento.
 */
@Injectable()
export class UbicacionLlegadaService {
  private readonly logger = new Logger(UbicacionLlegadaService.name);

  constructor(private prisma: PrismaService) {}

  /** true si guardó el resultado; false si el viaje no tiene llegada o falló. */
  async recalcularViaje(tripId: number): Promise<boolean> {
    try {
      const trip = await this.prisma.transportTrip.findUnique({
        where: { id: tripId },
        select: {
          planning: { select: SELECT_REFERENCIA },
          arrival: {
            select: {
              id: true,
              lat: true,
              lng: true,
              gpsPrecisionM: true,
              fotosGps: true,
              capturedAt: true,
              planning: { select: SELECT_REFERENCIA },
            },
          },
        },
      });
      if (!trip?.arrival) return false;

      const { arrival } = trip;
      // Manda la planificación elegida en obra; si la llegada no tiene (APK
      // viejos), la del viaje.
      const planificacion = arrival.planning ?? trip.planning;

      const resultado = calcularUbicacionLlegada({
        escaneo: {
          lat: arrival.lat,
          lng: arrival.lng,
          precisionM: arrival.gpsPrecisionM,
        },
        fotos: parseFotosGps(arrival.fotosGps),
        capturedAt: arrival.capturedAt,
        referencia: planificacion
          ? {
              lat: planificacion.ubicacionLlegadaLat,
              lng: planificacion.ubicacionLlegadaLng,
              radioM: planificacion.radioLlegadaM,
            }
          : null,
      });

      await this.prisma.transportArrival.update({
        where: { id: arrival.id },
        data: datosUbicacionCalculada(resultado),
      });
      return true;
    } catch (error: any) {
      this.logger.error(
        `No se pudo calcular la ubicación de llegada del viaje ${tripId}: ${error?.message ?? error}`,
      );
      return false;
    }
  }

  /** Todas las llegadas cuya referencia es esta planificación. */
  async recalcularPlanificacion(planningId: number): Promise<number> {
    const llegadas = await this.prisma.transportArrival.findMany({
      where: {
        OR: [{ planningId }, { planningId: null, trip: { planningId } }],
      },
      select: { tripId: true },
    });
    return this.recalcularVarios(llegadas.map((l) => l.tripId));
  }

  /** Relleno de viajes completados antes de esta función, por tandas. */
  async recalcularSinCalcular(
    limite = 2000,
  ): Promise<{ recalculadas: number; restantes: number }> {
    const llegadas = await this.prisma.transportArrival.findMany({
      where: { ubicacionCalculadaEn: null },
      select: { tripId: true },
      orderBy: { id: 'asc' },
      take: limite,
    });
    const recalculadas = await this.recalcularVarios(
      llegadas.map((l) => l.tripId),
    );
    const restantes = await this.prisma.transportArrival.count({
      where: { ubicacionCalculadaEn: null },
    });
    return { recalculadas, restantes };
  }

  private async recalcularVarios(tripIds: number[]): Promise<number> {
    let guardadas = 0;
    for (let i = 0; i < tripIds.length; i += LOTE) {
      const resultados = await Promise.all(
        tripIds.slice(i, i + LOTE).map((id) => this.recalcularViaje(id)),
      );
      guardadas += resultados.filter(Boolean).length;
    }
    return guardadas;
  }
}
