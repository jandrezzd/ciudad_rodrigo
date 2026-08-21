import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consumo de stock de cantera mediante libro mayor.
 *
 * Reglas que hacen que esto aguante la app offline:
 *
 * 1. NUNCA rechaza un despacho. Si el saldo no alcanza, el movimiento igual se
 *    registra y el saldo queda negativo. El viaje ya ocurrió físicamente:
 *    negarlo no revierte nada, solo pierde el dato.
 * 2. Idempotente por construcción: `tripId` es UNIQUE, así que un reenvío del
 *    mismo viaje no puede descontar dos veces aunque el código lo intente.
 * 3. Sin lecturas previas de saldo ni bloqueos: cada movimiento es un INSERT
 *    independiente, así que un lote de sincronización entra en paralelo sin
 *    contención entre vehículos.
 * 4. Se guarda `capturedAt` (reloj del teléfono), no la fecha de sincronización,
 *    para que el histórico refleje cuándo salió realmente el material.
 */
@Injectable()
export class CanteraStockService {
  private readonly logger = new Logger(CanteraStockService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Toneladas equivalentes a los m3 despachados. El factor es TN por M3, así
   * que siempre se multiplica: la dirección de conversión solo describe cómo
   * cargó el usuario la equivalencia, no cambia la relación entre unidades.
   */
  private calcularToneladas(m3: number, factor: number | null): number | null {
    if (factor == null || !Number.isFinite(factor) || factor <= 0) return null;
    return m3 * factor;
  }

  /**
   * Registra el consumo de un viaje. Se llama DENTRO de la transacción que crea
   * el viaje: si el trip se guarda y el movimiento no, quedarían desfasados sin
   * forma de detectarlo.
   *
   * Devuelve null (sin registrar nada) cuando faltan datos para imputar el
   * consumo — sin cantera o sin material no hay a qué stock descontarle.
   */
  async registrarConsumo(
    tx: Prisma.TransactionClient,
    params: {
      tripId: number;
      canteraId: number | null;
      materialId: number | null;
      m3: number;
      capturedAt: Date;
    },
  ) {
    const { tripId, canteraId, materialId, m3, capturedAt } = params;

    if (canteraId == null || materialId == null) {
      this.logger.warn(
        `Viaje ${tripId} sin cantera o material: no se descuenta stock (canteraId=${canteraId}, materialId=${materialId})`,
      );
      return null;
    }

    if (!Number.isFinite(m3) || m3 <= 0) return null;

    const canteraMaterial = await tx.canteraMaterial.findUnique({
      where: { canteraId_materialId: { canteraId, materialId } },
    });

    if (!canteraMaterial) {
      // La cantera no declara ese material. Se deja constancia y el viaje sigue:
      // bloquearlo impediría registrar un despacho que ya ocurrió.
      this.logger.warn(
        `La cantera ${canteraId} no tiene declarado el material ${materialId}. Viaje ${tripId} registrado sin descuento.`,
      );
      return null;
    }

    const toneladas = this.calcularToneladas(m3, canteraMaterial.factor);

    // El UNIQUE de tripId es la garantía real de no duplicar; el upsert evita
    // que un replay explote con P2002 en vez de resolverse limpio.
    const movimiento = await tx.canteraMaterialMovimiento.upsert({
      where: { tripId },
      create: {
        canteraMaterialId: canteraMaterial.id,
        tripId,
        m3,
        toneladas,
        tipo: 'SALIDA',
        capturedAt,
      },
      update: {},
    });

    this.logger.log(
      `Stock descontado | viaje ${tripId} | cantera ${canteraId} | material ${materialId} | ${m3} m3`,
    );

    return movimiento;
  }

  /**
   * Reajusta el consumo cuando se corrigen los m3 después de cerrado el viaje.
   * Actualiza el renglón existente en lugar de tocar un contador, así el saldo
   * se recompone solo.
   */
  async ajustarConsumo(
    tx: Prisma.TransactionClient,
    tripId: number,
    m3: number,
    motivo = 'Corrección de m3',
  ) {
    const movimiento = await tx.canteraMaterialMovimiento.findUnique({
      where: { tripId },
      include: { canteraMaterial: true },
    });

    if (!movimiento) return null;
    if (!Number.isFinite(m3) || m3 < 0) return movimiento;

    const toneladas = this.calcularToneladas(m3, movimiento.canteraMaterial.factor);

    const actualizado = await tx.canteraMaterialMovimiento.update({
      where: { tripId },
      data: { m3, toneladas, tipo: 'AJUSTE', motivo },
    });

    this.logger.log(
      `Consumo ajustado | viaje ${tripId} | ${movimiento.m3} -> ${m3} m3`,
    );

    return actualizado;
  }

  /**
   * Resuelve de qué cantera sale un viaje, en orden de precedencia:
   * la enviada explícitamente, la del vehículo en su planificación, o —si la
   * planificación tiene una sola cantera— esa.
   */
  async resolverCantera(params: {
    canteraIdExplicita?: number | null;
    planningId?: number | null;
    vehicleId: number;
  }): Promise<number | null> {
    const { canteraIdExplicita, planningId, vehicleId } = params;

    if (canteraIdExplicita != null) return canteraIdExplicita;
    if (planningId == null) return null;

    const planningVehicle = await this.prisma.planningVehicle.findFirst({
      where: { planningId, vehicleId },
      select: { canteraId: true },
    });
    if (planningVehicle?.canteraId != null) return planningVehicle.canteraId;

    const canteras = await this.prisma.planningCantera.findMany({
      where: { planningId },
      select: { canteraId: true },
      take: 2,
    });

    return canteras.length === 1 ? canteras[0].canteraId : null;
  }

  /** Saldo actual de un material en una cantera */
  async getSaldo(canteraId: number, materialId: number) {
    const canteraMaterial = await this.prisma.canteraMaterial.findUnique({
      where: { canteraId_materialId: { canteraId, materialId } },
      include: { movimientos: { select: { m3: true, toneladas: true } } },
    });

    if (!canteraMaterial) return null;

    const consumidoM3 = canteraMaterial.movimientos.reduce(
      (total, mov) => total + (mov.m3 ?? 0),
      0,
    );
    const consumidoToneladas = canteraMaterial.movimientos.reduce(
      (total, mov) => total + (mov.toneladas ?? 0),
      0,
    );

    return {
      canteraId,
      materialId,
      asignadoM3: canteraMaterial.metrosCubicos ?? 0,
      asignadoToneladas: canteraMaterial.toneladas ?? 0,
      consumidoM3,
      consumidoToneladas,
      disponibleM3: (canteraMaterial.metrosCubicos ?? 0) - consumidoM3,
      disponibleToneladas: (canteraMaterial.toneladas ?? 0) - consumidoToneladas,
    };
  }
}
