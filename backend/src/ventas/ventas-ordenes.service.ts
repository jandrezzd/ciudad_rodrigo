import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import {
  CreateVentaOrdenDto,
  QueryVentaOrdenesDto,
  UpdateVentaOrdenDto,
  VentaOrdenItemDto,
} from './DTOs/venta-orden.dto';

/** Lo que la grilla y el detalle de una orden necesitan siempre. */
const ORDEN_INCLUDE = {
  client: {
    select: { id: true, name: true, companyname: true, ruc: true, type: true },
  },
  constSite: { select: { id: true, name: true, province: true, canton: true } },
  cerradaPor: { select: { id: true, name: true } },
  items: {
    include: {
      material: { select: { id: true, materialType: true } },
      // Solo activas: una venta anulada no debe seguir contando como despacho.
      ventas: { where: { isActive: true }, select: { m3: true } },
    },
  },
} satisfies Prisma.VentaOrdenInclude;

/**
 * Pedido de un cliente para una de sus obras.
 *
 * A diferencia del stock de cantera (VentasStockService), aquí el tope SÍ se
 * hace cumplir: lo que el cliente pidió es un límite duro, no una referencia.
 * Es la única excepción deliberada a la regla de "nunca rechazar" que rige el
 * resto del módulo de ventas.
 */
@Injectable()
export class VentasOrdenesService {
  private readonly logger = new Logger(VentasOrdenesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Consumo desde las ventas ───────────────────────────────────────────────

  /**
   * Resuelve la línea de una orden al registrar una venta y valida que haya
   * cupo. Se llama DENTRO de la transacción que crea la venta, con el mismo
   * cliente transaccional, porque el bloqueo de la fila solo sirve de algo si
   * el bloqueo y la escritura final son atómicos entre sí.
   *
   * Si algo no resuelve (línea inexistente, orden cerrada, sin cupo), lanza y
   * la transacción entera se revierte: a diferencia del vehículo, aquí NO se
   * registra "sin vincular" — el supervisor tiene que corregir la cantidad o
   * elegir otra orden, y como hay conexión garantizada, puede hacerlo ya mismo.
   */
  async resolverOrdenItem(
    tx: Prisma.TransactionClient,
    ordenItemId: number,
    m3Solicitado: number,
  ): Promise<{ ordenId: number; constSiteId: number; materialId: number }> {
    // SELECT ... FOR UPDATE: bloquea la fila hasta que esta transacción
    // termine, para que dos despachos simultáneos de la última porción de la
    // línea no pasen los dos a la vez. El segundo espera a que el primero
    // termine, y cuando le toca, ya ve el saldo actualizado.
    const filas = await tx.$queryRaw<
      { id: number; materialId: number; m3Asignados: number; ordenId: number }[]
    >`
      SELECT id, "materialId", "m3Asignados", "ordenId"
      FROM "VentaOrdenItem"
      WHERE id = ${ordenItemId}
      FOR UPDATE
    `;
    const item = filas[0];

    if (!item) {
      throw new BusinessException(
        'ORDEN_ITEM_NOT_FOUND',
        'LA LÍNEA DE LA ORDEN NO EXISTE',
        false,
      );
    }

    const orden = await tx.ventaOrden.findUnique({
      where: { id: item.ordenId },
      select: { id: true, estado: true, isActive: true, constSiteId: true },
    });

    if (!orden || !orden.isActive) {
      throw new BusinessException(
        'ORDEN_NOT_FOUND',
        'LA ORDEN NO EXISTE',
        false,
      );
    }

    if (orden.estado !== 'ABIERTA') {
      throw new BusinessException(
        'ORDEN_NO_ABIERTA',
        'LA ORDEN YA SE CERRÓ O SE COMPLETÓ. ELIJA OTRA DESDE EL CATÁLOGO.',
        false,
      );
    }

    const { _sum } = await tx.ventaCantera.aggregate({
      where: { ordenItemId, isActive: true },
      _sum: { m3: true },
    });
    const despachado = _sum.m3 ?? 0;
    const disponible = item.m3Asignados - despachado;

    if (m3Solicitado > disponible) {
      throw new BusinessException(
        'ORDEN_SIN_CUPO',
        `LA ORDEN SOLO TIENE ${disponible} M³ DISPONIBLES DE ESTE MATERIAL`,
        false,
      );
    }

    return {
      ordenId: orden.id,
      constSiteId: orden.constSiteId,
      materialId: item.materialId,
    };
  }

  /**
   * Recalcula el estado de la orden a partir de sus líneas. Se llama después
   * de cada venta que la afecte (alta, corrección de m³, anulación).
   *
   * Solo se autogestiona entre ABIERTA y COMPLETADA. Si un ADMIN ya la cerró a
   * mano (CERRADA) o la canceló, una venta editada después no la reabre —
   * esos dos estados son una decisión, no un cálculo.
   */
  async recalcularEstadoOrden(tx: Prisma.TransactionClient, ordenId: number) {
    const orden = await tx.ventaOrden.findUnique({
      where: { id: ordenId },
      select: { estado: true },
    });
    if (!orden) return;
    if (orden.estado !== 'ABIERTA' && orden.estado !== 'COMPLETADA') return;

    const items = await tx.ventaOrdenItem.findMany({
      where: { ordenId },
      include: { ventas: { where: { isActive: true }, select: { m3: true } } },
    });

    // Una orden sin líneas (no debería darse, `create` exige al menos una)
    // nunca se da por completada sola.
    const todoDespachado =
      items.length > 0 &&
      items.every(
        (i) => i.ventas.reduce((acc, v) => acc + v.m3, 0) >= i.m3Asignados,
      );

    const nuevoEstado = todoDespachado ? 'COMPLETADA' : 'ABIERTA';
    if (nuevoEstado === orden.estado) return;

    await tx.ventaOrden.update({
      where: { id: ordenId },
      data: { estado: nuevoEstado },
    });
  }

  // ─── CRUD desde la web ──────────────────────────────────────────────────────

  private async generarCodigo(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const secuencia = await tx.ventaOrdenSequence.upsert({
      where: { year },
      create: { year, last: 1 },
      update: { last: { increment: 1 } },
    });
    return `ORD-${String(secuencia.last).padStart(4, '0')}-${year}`;
  }

  private validarItemsSinRepetir(items: VentaOrdenItemDto[]) {
    const ids = items.map((i) => i.materialId);
    if (new Set(ids).size !== ids.length) {
      throw new BusinessException(
        'MATERIAL_REPETIDO',
        'LA ORDEN TIENE MATERIALES REPETIDOS',
        false,
        400,
      );
    }
  }

  private async validarMateriales(materialIds: number[]) {
    const unicos = [...new Set(materialIds)];
    const existentes = await this.prisma.material.findMany({
      where: { id: { in: unicos } },
      select: { id: true },
    });
    if (existentes.length !== unicos.length) {
      const encontrados = new Set(existentes.map((m) => m.id));
      const faltantes = unicos.filter((id) => !encontrados.has(id));
      throw new BusinessException(
        'MATERIAL_NOT_FOUND',
        `LOS SIGUIENTES MATERIALES NO EXISTEN: ${faltantes.join(', ')}`,
        false,
        400,
      );
    }
  }

  /**
   * Valida que el cliente y la obra existan, estén activos, y que la obra
   * realmente pertenezca a ese cliente (vía ClientConstSite) — el premisa
   * entera de este módulo es "cliente → sus obras", así que una obra ajena no
   * se puede colar por error de selección.
   */
  private async validarClienteYObra(clientId: number, constSiteId: number) {
    const [client, constSite, vinculo] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, isActive: true, companyname: true },
      }),
      this.prisma.constSite.findUnique({
        where: { id: constSiteId },
        select: { id: true, isActive: true, name: true },
      }),
      this.prisma.clientConstSite.findUnique({
        where: { clientId_constSiteId: { clientId, constSiteId } },
      }),
    ]);

    if (!client) throw new NotFoundException('EL CLIENTE NO EXISTE');
    if (!client.isActive) {
      throw new BusinessException(
        'CLIENTE_INACTIVO',
        `EL CLIENTE ${client.companyname} ESTÁ DADO DE BAJA`,
        false,
        400,
      );
    }

    if (!constSite) throw new NotFoundException('LA OBRA NO EXISTE');
    if (!constSite.isActive) {
      throw new BusinessException(
        'OBRA_INACTIVA',
        `LA OBRA ${constSite.name} ESTÁ DADA DE BAJA`,
        false,
        400,
      );
    }

    if (!vinculo) {
      throw new BusinessException(
        'OBRA_SIN_CLIENTE',
        `LA OBRA ${constSite.name} NO PERTENECE AL CLIENTE ${client.companyname}`,
        false,
        400,
      );
    }
  }

  /** Saldo por línea y totales de la orden, sin guardar ningún contador. */
  private formatOrden(orden: any) {
    const items = orden.items.map((item: any) => {
      const despachadoM3 = item.ventas.reduce(
        (acc: number, v: any) => acc + v.m3,
        0,
      );
      const disponibleM3 = item.m3Asignados - despachadoM3;
      const { ventas, ...resto } = item;
      return { ...resto, despachadoM3, disponibleM3, excedido: disponibleM3 < 0 };
    });

    const totales = items.reduce(
      (acc: any, i: any) => ({
        asignadoM3: acc.asignadoM3 + i.m3Asignados,
        despachadoM3: acc.despachadoM3 + i.despachadoM3,
        disponibleM3: acc.disponibleM3 + i.disponibleM3,
      }),
      { asignadoM3: 0, despachadoM3: 0, disponibleM3: 0 },
    );

    const { items: crudo, ...resto } = orden;
    return { ...resto, items, totales };
  }

  async create(data: CreateVentaOrdenDto) {
    await this.validarClienteYObra(data.clientId, data.constSiteId);
    this.validarItemsSinRepetir(data.items);
    await this.validarMateriales(data.items.map((i) => i.materialId));

    const orden = await this.prisma.$transaction(async (tx) => {
      const codigo = await this.generarCodigo(tx);
      return tx.ventaOrden.create({
        data: {
          codigo,
          clientId: data.clientId,
          constSiteId: data.constSiteId,
          observacion: data.observacion ?? null,
          items: {
            create: data.items.map((i) => ({
              materialId: i.materialId,
              m3Asignados: i.m3Asignados,
            })),
          },
        },
        include: ORDEN_INCLUDE,
      });
    });

    this.logger.log(`Orden creada | ${orden.codigo} | cliente ${orden.clientId} | obra ${orden.constSiteId}`);
    return this.formatOrden(orden);
  }

  /** Grilla web. Por defecto solo activas: el borrado es lógico. */
  async findAll(query: QueryVentaOrdenesDto) {
    const where: Prisma.VentaOrdenWhereInput = { isActive: query.isActive ?? true };
    if (query.clientId != null) where.clientId = query.clientId;
    if (query.constSiteId != null) where.constSiteId = query.constSiteId;
    if (query.estado != null) where.estado = query.estado;

    const ordenes = await this.prisma.ventaOrden.findMany({
      where,
      include: ORDEN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return ordenes.map((o) => this.formatOrden(o));
  }

  async findOne(id: number) {
    const orden = await this.prisma.ventaOrden.findUnique({
      where: { id },
      include: ORDEN_INCLUDE,
    });
    if (!orden) throw new NotFoundException('LA ORDEN NO EXISTE');
    return this.formatOrden(orden);
  }

  /**
   * Sincroniza las líneas conservando las que ya tienen despachos: actualiza
   * las que siguen, crea las nuevas y borra las que se quitaron. Una línea con
   * despachos activos no se puede quitar — mismo criterio que
   * `syncMateriales` en material-providers.service.ts.
   */
  private async syncItems(
    tx: Prisma.TransactionClient,
    ordenId: number,
    items: VentaOrdenItemDto[],
  ) {
    const actuales = await tx.ventaOrdenItem.findMany({
      where: { ordenId },
      include: { ventas: { where: { isActive: true }, select: { id: true } } },
    });

    const deseados = new Map(items.map((i) => [i.materialId, i]));

    for (const actual of actuales) {
      if (deseados.has(actual.materialId)) continue;
      if (actual.ventas.length > 0) {
        throw new BusinessException(
          'ITEM_CON_DESPACHOS',
          `NO SE PUEDE QUITAR UN MATERIAL QUE YA TIENE DESPACHOS REGISTRADOS (materialId ${actual.materialId})`,
          false,
          400,
        );
      }
      await tx.ventaOrdenItem.delete({ where: { id: actual.id } });
    }

    for (const item of items) {
      await tx.ventaOrdenItem.upsert({
        where: { ordenId_materialId: { ordenId, materialId: item.materialId } },
        create: { ordenId, materialId: item.materialId, m3Asignados: item.m3Asignados },
        update: { m3Asignados: item.m3Asignados },
      });
    }
  }

  /**
   * Edita la orden. `clientId` y `constSiteId` no se pueden cambiar — igual
   * que una venta no cambia de vehículo, una orden no cambia de dueño.
   */
  async update(id: number, data: UpdateVentaOrdenDto) {
    const existe = await this.prisma.ventaOrden.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('LA ORDEN NO EXISTE');

    if (data.items) {
      this.validarItemsSinRepetir(data.items);
      await this.validarMateriales(data.items.map((i) => i.materialId));
    }

    const actualizada = await this.prisma.$transaction(async (tx) => {
      if (data.items) {
        await this.syncItems(tx, id, data.items);
      }

      if (data.observacion !== undefined) {
        await tx.ventaOrden.update({
          where: { id },
          data: { observacion: data.observacion },
        });
      }

      // Las líneas pudieron cambiar de asignado: el estado se recalcula por
      // si acaba de completarse o de dejar de estarlo.
      await this.recalcularEstadoOrden(tx, id);

      return tx.ventaOrden.findUnique({ where: { id }, include: ORDEN_INCLUDE });
    });

    return this.formatOrden(actualizada);
  }

  /** Cierre manual, con motivo obligatorio. */
  async cerrar(id: number, userId: number, motivo: string) {
    const orden = await this.prisma.ventaOrden.findUnique({
      where: { id },
      select: { id: true, estado: true },
    });
    if (!orden) throw new NotFoundException('LA ORDEN NO EXISTE');

    if (orden.estado === 'CERRADA' || orden.estado === 'CANCELADA') {
      throw new BusinessException(
        'ORDEN_YA_CERRADA',
        'ESTA ORDEN YA ESTÁ CERRADA',
        false,
        400,
      );
    }

    const cerrada = await this.prisma.ventaOrden.update({
      where: { id },
      data: {
        estado: 'CERRADA',
        fechaCierre: new Date(),
        cerradaPorId: userId,
        motivoCierre: motivo,
      },
      include: ORDEN_INCLUDE,
    });

    return this.formatOrden(cerrada);
  }

  /**
   * Baja lógica. Rechaza si la orden ya tiene algún despacho: borrarla dejaría
   * esas ventas sin la orden que las explica.
   */
  async remove(id: number) {
    const orden = await this.prisma.ventaOrden.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!orden) throw new NotFoundException('LA ORDEN NO EXISTE');

    const conDespachos = await this.prisma.ventaCantera.findFirst({
      where: { ordenId: id },
      select: { id: true },
    });
    if (conDespachos) {
      throw new BusinessException(
        'ORDEN_CON_DESPACHOS',
        'NO SE PUEDE ELIMINAR UNA ORDEN QUE YA TIENE DESPACHOS REGISTRADOS',
        false,
        400,
      );
    }

    return this.prisma.ventaOrden.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Catálogo que consume la app: cliente → sus obras → sus órdenes abiertas →
   * sus líneas con saldo. Una línea sin saldo no aparece aunque la orden siga
   * abierta por otra línea — evita que el supervisor elija una ya agotada.
   */
  async getAbiertas() {
    const ordenes = await this.prisma.ventaOrden.findMany({
      where: { estado: 'ABIERTA', isActive: true },
      include: {
        client: { select: { id: true, name: true, companyname: true, type: true } },
        constSite: { select: { id: true, name: true } },
        items: {
          include: {
            material: { select: { id: true, materialType: true } },
            ventas: { where: { isActive: true }, select: { m3: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const porCliente = new Map<number, any>();

    for (const orden of ordenes) {
      const items = orden.items
        .map((item) => {
          const despachadoM3 = item.ventas.reduce((acc, v) => acc + v.m3, 0);
          const disponibleM3 = item.m3Asignados - despachadoM3;
          return {
            ordenItemId: item.id,
            materialId: item.materialId,
            materialType: item.material.materialType,
            asignadoM3: item.m3Asignados,
            despachadoM3,
            disponibleM3,
          };
        })
        .filter((item) => item.disponibleM3 > 0);

      if (items.length === 0) continue;

      const cliente = porCliente.get(orden.clientId) ?? {
        clientId: orden.clientId,
        clientNombre: orden.client.companyname ?? orden.client.name,
        clientTipo: orden.client.type,
        obras: new Map<number, any>(),
      };

      const obra = cliente.obras.get(orden.constSiteId) ?? {
        constSiteId: orden.constSiteId,
        constSiteNombre: orden.constSite.name,
        ordenes: [] as any[],
      };

      obra.ordenes.push({ ordenId: orden.id, codigo: orden.codigo, items });
      cliente.obras.set(orden.constSiteId, obra);
      porCliente.set(orden.clientId, cliente);
    }

    return [...porCliente.values()].map((cliente) => ({
      ...cliente,
      obras: [...cliente.obras.values()],
    }));
  }
}
