import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';

/**
 * Stock de material de los puntos de venta.
 *
 * Hereda las cuatro reglas de CanteraStockService, que son las que hacen que un
 * saldo aguante una app que sincroniza días después:
 *
 * 1. **Nunca rechaza un despacho.** Si no alcanza el saldo, el movimiento se
 *    registra igual y el disponible queda negativo, marcado en la web. El camión
 *    ya cargó: negarle el registro no devuelve el material a la cantera, solo
 *    hace que la venta desaparezca del sistema.
 * 2. **Idempotente por construcción.** `ventaId` es UNIQUE, así que el reenvío
 *    del mismo uuid no puede consumir dos veces.
 * 3. **Sin leer el saldo antes de escribir.** Cada movimiento es un INSERT
 *    independiente; dos camiones que despachan a la vez no se estorban.
 * 4. **Guarda `capturedAt`**, la hora real del despacho, no la de sincronización.
 *
 * El saldo nunca se almacena: es (asignado - salidas + reversas), derivado
 * siempre del libro mayor.
 */
@Injectable()
export class VentasStockService {
  private readonly logger = new Logger(VentasStockService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Consumo desde las ventas ───────────────────────────────────────────────

  /**
   * Descuenta una venta del stock. Se llama DENTRO de la transacción que crea la
   * venta, así que recibe el cliente transaccional.
   *
   * Si la cantera no tiene ese material declarado, se crea la fila con asignado
   * en 0 en vez de descartar el movimiento: el despacho ocurrió y tiene que
   * verse. El disponible queda negativo y la web lo marca, que es justo la señal
   * de que falta cargar el stock.
   */
  async registrarSalida(
    tx: Prisma.TransactionClient,
    params: {
      ventaId: number;
      canteraId: number;
      materialId: number;
      m3: number;
      capturedAt: Date;
    },
  ) {
    const { ventaId, canteraId, materialId, m3, capturedAt } = params;

    if (!Number.isFinite(m3) || m3 <= 0) {
      this.logger.warn(
        `Venta ${ventaId}: m3 inválido (${m3}), no se registra movimiento de stock`,
      );
      return null;
    }

    const stock = await tx.ventaCanteraStock.upsert({
      where: { canteraId_materialId: { canteraId, materialId } },
      create: { canteraId, materialId, m3Asignados: 0 },
      update: {},
      select: { id: true, m3Asignados: true },
    });

    // El UNIQUE de ventaId es la garantía real de no duplicar; el upsert evita
    // que un reenvío explote con P2002.
    const movimiento = await tx.ventaStockMovimiento.upsert({
      where: { ventaId },
      create: {
        stockId: stock.id,
        ventaId,
        m3,
        tipo: 'SALIDA',
        capturedAt,
      },
      update: {},
    });

    return movimiento;
  }

  /**
   * Reajusta el consumo cuando un ADMIN corrige los m3 de una venta desde la web.
   * Edita el renglón en vez de crear un contra-asiento: así el saldo se recompone
   * solo, sin dejar dos movimientos que haya que leer juntos para entenderlo.
   */
  async ajustarSalida(
    tx: Prisma.TransactionClient,
    ventaId: number,
    m3: number,
    motivo = 'Corrección de m³ desde la web',
  ) {
    const movimiento = await tx.ventaStockMovimiento.findUnique({
      where: { ventaId },
      select: { id: true },
    });

    if (!movimiento) {
      this.logger.warn(
        `Venta ${ventaId}: no tiene movimiento de stock que ajustar`,
      );
      return null;
    }

    return tx.ventaStockMovimiento.update({
      where: { id: movimiento.id },
      data: { m3, tipo: 'AJUSTE', motivo },
    });
  }

  /**
   * Devuelve al saldo lo que consumió una venta anulada. El movimiento pasa a
   * REVERSA y deja de contar como consumo, pero no se borra: el registro de que
   * aquello se dio de baja tiene que quedar.
   */
  async revertirSalida(
    tx: Prisma.TransactionClient,
    ventaId: number,
    motivo = 'Venta anulada desde la web',
  ) {
    const movimiento = await tx.ventaStockMovimiento.findUnique({
      where: { ventaId },
      select: { id: true },
    });

    if (!movimiento) return null;

    return tx.ventaStockMovimiento.update({
      where: { id: movimiento.id },
      data: { tipo: 'REVERSA', motivo },
    });
  }

  // ─── Cálculo de saldos ──────────────────────────────────────────────────────

  /**
   * Consume lo que salió por una venta, y solo eso.
   *
   * Lo decide `ventaId`, no el tipo: `AJUSTE` se usa para dos cosas distintas
   * —corregir los m³ de una venta y corregir a mano el asignado— y mirar solo el
   * tipo hacía que subir el stock asignado se contabilizara además como consumo,
   * restando dos veces.
   *
   * Los movimientos manuales (INGRESO y AJUSTE sin venta) ya están reflejados en
   * `m3Asignados`; aquí no vuelven a contar. REVERSA devuelve lo consumido.
   */
  private consumoDe(movimientos: { m3: number; tipo: string; ventaId?: number | null }[]) {
    return movimientos.reduce((acc, mov) => {
      if (mov.ventaId == null) return acc;
      if (mov.tipo === 'SALIDA' || mov.tipo === 'AJUSTE') return acc + mov.m3;
      return acc;
    }, 0);
  }

  private formatStock<T extends { m3Asignados: number }>(
    stock: T & {
      movimientos?: { m3: number; tipo: string; ventaId?: number | null }[];
    },
  ) {
    const consumidoM3 = this.consumoDe(stock.movimientos ?? []);
    const asignadoM3 = stock.m3Asignados ?? 0;
    const disponibleM3 = asignadoM3 - consumidoM3;

    const { movimientos, ...resto } = stock;

    return {
      ...resto,
      asignadoM3,
      consumidoM3,
      disponibleM3,
      /// Se despachó más de lo asignado. No es un error del sistema: con la app
      /// offline la venta ya ocurrió, así que se registra y se marca.
      excedido: disponibleM3 < 0,
    };
  }

  /** Saldo de un material concreto en una cantera de venta. */
  async getSaldo(canteraId: number, materialId: number) {
    const stock = await this.prisma.ventaCanteraStock.findUnique({
      where: { canteraId_materialId: { canteraId, materialId } },
      include: {
        material: { select: { id: true, materialType: true } },
        movimientos: { select: { m3: true, tipo: true, ventaId: true } },
      },
    });

    if (!stock) return null;
    return this.formatStock(stock);
  }

  /** Stock completo de una cantera de venta, material por material. */
  async getStockByCantera(canteraId: number) {
    const cantera = await this.prisma.cantera.findUnique({
      where: { id: canteraId },
      select: {
        id: true,
        nombre: true,
        provincia: true,
        canton: true,
        materialProvider: {
          select: { id: true, razonsocial: true, nombreComercial: true },
        },
      },
    });

    if (!cantera) throw new NotFoundException('LA CANTERA NO EXISTE');

    const stocks = await this.prisma.ventaCanteraStock.findMany({
      where: { canteraId, isActive: true },
      include: {
        material: { select: { id: true, materialType: true } },
        movimientos: { select: { m3: true, tipo: true, ventaId: true } },
      },
      orderBy: { id: 'asc' },
    });

    return { ...cantera, materiales: stocks.map((s) => this.formatStock(s)) };
  }

  /**
   * Stock de todas las canteras que son punto de venta, con los totales. Es lo
   * que alimenta la vista de stock en la web.
   */
  async getStockGeneral(canteraId?: number) {
    const stocks = await this.prisma.ventaCanteraStock.findMany({
      where: {
        isActive: true,
        ...(canteraId ? { canteraId } : {}),
      },
      include: {
        material: { select: { id: true, materialType: true } },
        movimientos: { select: { m3: true, tipo: true, ventaId: true } },
        cantera: {
          select: {
            id: true,
            nombre: true,
            provincia: true,
            canton: true,
            materialProvider: {
              select: { id: true, razonsocial: true, nombreComercial: true },
            },
          },
        },
      },
      orderBy: [{ canteraId: 'asc' }, { id: 'asc' }],
    });

    const formateados = stocks.map((s) => this.formatStock(s));

    // Se agrupa por cantera para que la web no tenga que rearmar la jerarquía.
    const porCantera = new Map<number, any>();
    for (const stock of formateados) {
      const actual = porCantera.get(stock.canteraId) ?? {
        ...stock.cantera,
        materiales: [] as any[],
      };
      const { cantera, ...sinCantera } = stock as any;
      actual.materiales.push(sinCantera);
      porCantera.set(stock.canteraId, actual);
    }

    const totales = formateados.reduce(
      (acc, s) => ({
        asignadoM3: acc.asignadoM3 + s.asignadoM3,
        consumidoM3: acc.consumidoM3 + s.consumidoM3,
        disponibleM3: acc.disponibleM3 + s.disponibleM3,
      }),
      { asignadoM3: 0, consumidoM3: 0, disponibleM3: 0 },
    );

    return { canteras: [...porCantera.values()], totales };
  }

  /** Libro mayor de una cantera de venta, lo más reciente primero. */
  async getMovimientosByCantera(canteraId: number) {
    return this.prisma.ventaStockMovimiento.findMany({
      where: { stock: { canteraId } },
      include: {
        stock: {
          select: {
            id: true,
            material: { select: { id: true, materialType: true } },
          },
        },
        user: { select: { id: true, name: true } },
        venta: {
          select: {
            id: true,
            vehicleIdText: true,
            plate: true,
            comprador: true,
          },
        },
      },
      orderBy: { capturedAt: 'desc' },
      take: 300,
    });
  }

  // ─── Administración del stock desde la web ──────────────────────────────────

  /**
   * Carga material en una cantera de venta. Suma al asignado y deja el
   * movimiento: el número y su historia siempre cuadran.
   */
  async registrarIngreso(
    userId: number,
    data: {
      canteraId: number;
      materialId: number;
      m3: number;
      motivo?: string;
    },
  ) {
    await this.validarCanteraYMaterial(data.canteraId, data.materialId);

    if (!Number.isFinite(data.m3) || data.m3 <= 0) {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'LA CANTIDAD DEL INGRESO DEBE SER MAYOR A CERO',
        false,
        400,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.ventaCanteraStock.upsert({
        where: {
          canteraId_materialId: {
            canteraId: data.canteraId,
            materialId: data.materialId,
          },
        },
        create: {
          canteraId: data.canteraId,
          materialId: data.materialId,
          m3Asignados: data.m3,
        },
        update: { m3Asignados: { increment: data.m3 }, isActive: true },
      });

      await tx.ventaStockMovimiento.create({
        data: {
          stockId: stock.id,
          m3: data.m3,
          tipo: 'INGRESO',
          motivo: data.motivo ?? null,
          userId,
          capturedAt: new Date(),
        },
      });

      return stock;
    });
  }

  /**
   * Corrige a mano la cantidad asignada. El motivo es obligatorio: un saldo que
   * cambia sin explicación es indistinguible de un error.
   */
  async ajustarAsignado(
    userId: number,
    stockId: number,
    m3Asignados: number,
    motivo: string,
  ) {
    if (!Number.isFinite(m3Asignados) || m3Asignados < 0) {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'LA CANTIDAD ASIGNADA NO PUEDE SER NEGATIVA',
        false,
        400,
      );
    }

    const stock = await this.prisma.ventaCanteraStock.findUnique({
      where: { id: stockId },
      select: { id: true, m3Asignados: true },
    });
    if (!stock) throw new NotFoundException('EL STOCK NO EXISTE');

    const diferencia = m3Asignados - stock.m3Asignados;

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.ventaCanteraStock.update({
        where: { id: stockId },
        data: { m3Asignados },
      });

      await tx.ventaStockMovimiento.create({
        data: {
          stockId,
          // Se guarda la diferencia en valor absoluto; el motivo dice el resto.
          m3: Math.abs(diferencia),
          tipo: 'AJUSTE',
          motivo: `${motivo} (${stock.m3Asignados} → ${m3Asignados} m³)`,
          userId,
          capturedAt: new Date(),
        },
      });

      return actualizado;
    });
  }

  /**
   * Retira un material del punto de venta.
   *
   * Es baja lógica, así que se permite aunque ya haya vendido: la fila y todos
   * sus movimientos siguen en la base, y las ventas registradas conservan su
   * material intacto (cuelgan de `VentaCantera.materialId`, no de esta tabla).
   * Solo deja de ofrecerse y de aparecer en el stock.
   *
   * Bloquearlo era demasiado estricto: impedía limpiar un material cargado por
   * error y, de paso, dar de baja la cantera.
   */
  async retirarMaterial(stockId: number) {
    const stock = await this.prisma.ventaCanteraStock.findUnique({
      where: { id: stockId },
      select: { id: true },
    });
    if (!stock) throw new NotFoundException('EL STOCK NO EXISTE');

    return this.prisma.ventaCanteraStock.update({
      where: { id: stockId },
      data: { isActive: false },
    });
  }

  private async validarCanteraYMaterial(canteraId: number, materialId: number) {
    const [cantera, material] = await Promise.all([
      this.prisma.cantera.findUnique({
        where: { id: canteraId },
        select: { id: true },
      }),
      this.prisma.material.findUnique({
        where: { id: materialId },
        select: { id: true },
      }),
    ]);

    if (!cantera) throw new NotFoundException('LA CANTERA NO EXISTE');
    if (!material) throw new NotFoundException('EL MATERIAL NO EXISTE');
  }
}
