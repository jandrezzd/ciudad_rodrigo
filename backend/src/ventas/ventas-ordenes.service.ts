import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import { TelegramService } from '../telegram/telegram.service';
import {
  CreateVentaOrdenDto,
  QueryVentaOrdenesDto,
  ResolverVehiculoOrdenDto,
  UpdateVentaOrdenDto,
  VentaOrdenItemDto,
} from './DTOs/venta-orden.dto';
import { asegurarProveedorPorRuc } from '../owners/proveedor-por-ruc';
import { siguienteIdVehiculoExterno } from '../vehicles/id-vehiculo-externo';

const VEHICULO_ORDEN_SELECT = {
  id: true,
  vehicleid: true,
  plate: true,
  capacity: true,
  type: true,
} satisfies Prisma.VehicleSelect;

/** Lo que la grilla y el detalle de una orden necesitan siempre. */
const ORDEN_INCLUDE = {
  client: {
    select: { id: true, name: true, companyname: true, ruc: true, type: true },
  },
  constSite: { select: { id: true, name: true, province: true, canton: true } },
  cerradaPor: { select: { id: true, name: true } },
  transportista: { select: { id: true, name: true } },
  // Auditoría: solo la última persona que editó la orden, no un historial.
  editadoPor: { select: { id: true, name: true } },
  // Cambios de código hechos a mano, el más reciente primero.
  codigoCambios: {
    select: {
      codigoAnterior: true,
      codigoNuevo: true,
      intercambio: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
  vehiculos: {
    select: { vehicle: { select: VEHICULO_ORDEN_SELECT } },
    orderBy: { id: 'asc' },
  },
  items: {
    include: {
      material: { select: { id: true, materialType: true } },
      // Solo activas: una venta anulada no debe seguir contando como despacho.
      // plate/vehicleIdText/capturedAt: para el detalle "qué vehículo despachó
      // cuánto y cuándo" (reporte PDF de la orden), no solo el total.
      ventas: {
        where: { isActive: true },
        select: {
          codigo: true,
          m3: true,
          plate: true,
          vehicleIdText: true,
          capturedAt: true,
        },
        orderBy: { capturedAt: 'asc' },
      },
      // Todos, también los anulados: el detalle los muestra tachados. Para el
      // saldo solo cuentan los activos (ver m3ConsumoManual).
      consumosManuales: {
        select: {
          id: true,
          m3: true,
          viajes: true,
          motivo: true,
          isActive: true,
          createdAt: true,
          anuladoEn: true,
          motivoAnulacion: true,
          registradoPor: { select: { id: true, name: true } },
          anuladoPor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
} satisfies Prisma.VentaOrdenInclude;

/** A partir de cuántos m³ disponibles se avisa "este material se acaba". */
const UMBRAL_BAJO_STOCK_M3 = 5;

/** Solo los consumos manuales activos: para incluir en un `include` de items
 *  cuando lo único que hace falta es sumarlos. */
const CONSUMOS_ACTIVOS = {
  where: { isActive: true },
  select: { m3: true, isActive: true },
} as const;

const sumarM3 = (filas: { m3: number }[] = []) =>
  filas.reduce((acc, f) => acc + f.m3, 0);

/** m³ de consumo manual que cuentan para el saldo (los anulados no). */
const m3ConsumoManual = (filas: { m3: number; isActive?: boolean }[] = []) =>
  sumarM3(filas.filter((f) => f.isActive !== false));

/**
 * Lo consumido de una línea: despachos de la app (ventas activas) + consumo
 * manual registrado por un ADMIN. Es la ÚNICA forma de calcularlo, para que la
 * grilla, el detalle, la app, el control de cupo, el cierre automático y el
 * aviso de bajo stock digan siempre lo mismo.
 */
const consumoDeLinea = (item: {
  m3Asignados: number;
  ventas?: { m3: number }[];
  consumosManuales?: { m3: number; isActive?: boolean }[];
}) => {
  const despachadoAppM3 = sumarM3(item.ventas);
  const consumoManualM3 = m3ConsumoManual(item.consumosManuales);
  const despachadoM3 = despachadoAppM3 + consumoManualM3;
  return {
    despachadoAppM3,
    consumoManualM3,
    despachadoM3,
    disponibleM3: item.m3Asignados - despachadoM3,
  };
};

/** ORD-0045-2026: número de 4 cifras y año. Es el único formato aceptado al
 *  cambiar un código a mano, el mismo que genera el sistema. */
const CODIGO_ORDEN_REGEX = /^ORD-(\d{4})-(\d{4})$/;

/** Tope de saltos al buscar un código libre: con 9999 números por año, no
 *  encontrar uno libre en ese rango significa que algo anda mal, no seguir. */
const MAX_SALTOS_CODIGO = 10_000;

const formatearCodigoOrden = (numero: number, year: number) =>
  `ORD-${String(numero).padStart(4, '0')}-${year}`;

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

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

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
   *
   * Si este despacho deja la línea en `UMBRAL_BAJO_STOCK_M3` o menos y todavía
   * no se avisó, marca `alertaBajoStockEnviada` (dentro de esta misma
   * transacción, protegida por el FOR UPDATE de abajo, así que dos despachos
   * simultáneos que crucen el umbral a la vez nunca marcan los dos) y devuelve
   * `avisoBajoStockOrdenItemId` para que quien llamó mande el Telegram DESPUÉS
   * de que la transacción confirme — nunca dentro, es una llamada de red.
   */
  async resolverOrdenItem(
    tx: Prisma.TransactionClient,
    ordenItemId: number,
    m3Solicitado: number,
  ): Promise<{
    ordenId: number;
    constSiteId: number;
    materialId: number;
    avisoBajoStockOrdenItemId?: number;
  }> {
    // SELECT ... FOR UPDATE: bloquea la fila hasta que esta transacción
    // termine, para que dos despachos simultáneos de la última porción de la
    // línea no pasen los dos a la vez. El segundo espera a que el primero
    // termine, y cuando le toca, ya ve el saldo actualizado.
    const filas = await tx.$queryRaw<
      {
        id: number;
        materialId: number;
        m3Asignados: number;
        ordenId: number;
        alertaBajoStockEnviada: boolean;
      }[]
    >`
      SELECT id, "materialId", "m3Asignados", "ordenId", "alertaBajoStockEnviada"
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

    const disponible = await this.disponibleDeLinea(
      tx,
      ordenItemId,
      item.m3Asignados,
    );

    if (m3Solicitado > disponible) {
      throw new BusinessException(
        'ORDEN_SIN_CUPO',
        `LA ORDEN SOLO TIENE ${disponible} M³ DISPONIBLES DE ESTE MATERIAL`,
        false,
      );
    }

    const disponibleDespues = disponible - m3Solicitado;
    let avisoBajoStockOrdenItemId: number | undefined;
    if (
      disponibleDespues <= UMBRAL_BAJO_STOCK_M3 &&
      !item.alertaBajoStockEnviada
    ) {
      await tx.ventaOrdenItem.update({
        where: { id: item.id },
        data: { alertaBajoStockEnviada: true },
      });
      avisoBajoStockOrdenItemId = item.id;
    }

    return {
      ordenId: orden.id,
      constSiteId: orden.constSiteId,
      materialId: item.materialId,
      avisoBajoStockOrdenItemId,
    };
  }

  /** Disponible de una línea dentro de una transacción: asignado − ventas
   *  activas − consumo manual activo. Mismo criterio que `consumoDeLinea`. */
  private async disponibleDeLinea(
    tx: Prisma.TransactionClient,
    ordenItemId: number,
    m3Asignados: number,
  ): Promise<number> {
    const [ventas, consumos] = await Promise.all([
      tx.ventaCantera.aggregate({
        where: { ordenItemId, isActive: true },
        _sum: { m3: true },
      }),
      tx.ventaOrdenConsumoManual.aggregate({
        where: { ordenItemId, isActive: true },
        _sum: { m3: true },
      }),
    ]);
    return m3Asignados - (ventas._sum.m3 ?? 0) - (consumos._sum.m3 ?? 0);
  }

  /** Manda el aviso de bajo stock de una línea. Se llama DESPUÉS de que la
   *  transacción del despacho ya confirmó — nunca antes ni dentro de ella.
   *
   *  Nunca lanza: quien la llama lo hace sin await (`void`), y una promesa
   *  rechazada sin manejar en Node tumba el proceso entero. Antes solo se
   *  capturaba el fallo de Telegram, no el de la lectura de la línea. */
  async avisarBajoStockSiCorresponde(ordenItemId: number): Promise<void> {
    try {
      const item = await this.prisma.ventaOrdenItem.findUnique({
        where: { id: ordenItemId },
        include: {
          material: { select: { materialType: true } },
          orden: {
            select: { codigo: true, constSite: { select: { name: true } } },
          },
          ventas: { where: { isActive: true }, select: { m3: true } },
          consumosManuales: CONSUMOS_ACTIVOS,
        },
      });
      if (!item) return;

      await this.telegram.notifyMaterialBajo({
        codigo: item.orden.codigo,
        obra: item.orden.constSite.name,
        materialType: item.material.materialType,
        disponibleM3: consumoDeLinea(item).disponibleM3,
      });
    } catch (e) {
      this.logger.warn(`Aviso de bajo stock del item ${ordenItemId} falló: ${e}`);
    }
  }

  /** Botón "Enviar a Telegram" de la edición: reenvía el estado actual de la
   *  orden a los supervisores de cantera. No se usa al crear (eso es automático). */
  async notificarModificacion(id: number): Promise<{ enviados: number }> {
    const orden = await this.prisma.ventaOrden.findUnique({
      where: { id },
      include: ORDEN_INCLUDE,
    });
    if (!orden) throw new NotFoundException('LA ORDEN NO EXISTE');

    const enviados = await this.telegram.notifyOrdenModificada(orden);
    return { enviados };
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
      include: {
        ventas: { where: { isActive: true }, select: { m3: true } },
        consumosManuales: CONSUMOS_ACTIVOS,
      },
    });

    // Una orden sin líneas (no debería darse, `create` exige al menos una)
    // nunca se da por completada sola. Cuenta también el consumo manual.
    const todoDespachado =
      items.length > 0 &&
      items.every((i) => consumoDeLinea(i).disponibleM3 <= 0);

    const nuevoEstado = todoDespachado ? 'COMPLETADA' : 'ABIERTA';
    if (nuevoEstado === orden.estado) return;

    await tx.ventaOrden.update({
      where: { id: ordenId },
      data: { estado: nuevoEstado },
    });
  }

  // ─── CRUD desde la web ──────────────────────────────────────────────────────

  /**
   * Siguiente código libre del año. Un ADMIN puede haber cambiado a mano el
   * código de una orden a un número que el contador todavía no alcanzó (ej.
   * ORD-0001 → ORD-0045): cuando el contador llega a ese número, se lo salta y
   * sigue con el siguiente, en vez de fallar por código repetido.
   */
  private async generarCodigo(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    for (let intento = 0; intento < MAX_SALTOS_CODIGO; intento++) {
      const secuencia = await tx.ventaOrdenSequence.upsert({
        where: { year },
        create: { year, last: 1 },
        update: { last: { increment: 1 } },
      });
      const codigo = formatearCodigoOrden(secuencia.last, year);
      const ocupado = await tx.ventaOrden.findUnique({
        where: { codigo },
        select: { id: true },
      });
      if (!ocupado) return codigo;
      this.logger.log(`Código ${codigo} ya en uso (cambiado a mano), se salta`);
    }
    throw new BusinessException(
      'SIN_CODIGO_LIBRE',
      `NO HAY CÓDIGOS DE ORDEN LIBRES PARA ${year}`,
      false,
      500,
    );
  }

  /** Acciones de orden reservadas al ADMIN (además del permiso de editar). */
  private asegurarAdmin(user: { role?: string }, accion: string) {
    if (user.role !== 'ADMIN') {
      throw new BusinessException(
        'SOLO_ADMIN',
        `SOLO UN ADMINISTRADOR PUEDE ${accion}`,
        false,
        403,
      );
    }
  }

  // ─── Consumo manual ─────────────────────────────────────────────────────────

  /**
   * Registra m³ ya consumidos de una línea que no se registraron como venta
   * desde la app (solo ADMIN, solo órdenes ABIERTAS). No crea una venta ni
   * toca el stock de canteras: solo descuenta del disponible de la orden.
   *
   * Mismo bloqueo FOR UPDATE de la línea que usa un despacho de la app
   * (resolverOrdenItem): si los dos llegan a la vez, el segundo espera y ve el
   * saldo ya descontado, así que entre ambos nunca se pasan del asignado.
   */
  async registrarConsumoManual(
    ordenId: number,
    data: {
      ordenItemId: number;
      m3: number;
      viajes?: number | null;
      motivo: string;
    },
    user: { id: number; role?: string },
  ) {
    this.asegurarAdmin(user, 'REGISTRAR CONSUMO MANUAL');

    const motivo = (data.motivo ?? '').trim();
    if (motivo.length < 3) {
      throw new BusinessException(
        'MOTIVO_REQUERIDO',
        'INDIQUE EL MOTIVO DEL CONSUMO MANUAL',
        false,
        400,
      );
    }
    if (!(data.m3 > 0)) {
      throw new BusinessException(
        'M3_INVALIDO',
        'LOS M³ CONSUMIDOS DEBEN SER MAYORES A CERO',
        false,
        400,
      );
    }

    const aviso = await this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<
        {
          id: number;
          ordenId: number;
          m3Asignados: number;
          alertaBajoStockEnviada: boolean;
        }[]
      >`
        SELECT id, "ordenId", "m3Asignados", "alertaBajoStockEnviada"
        FROM "VentaOrdenItem"
        WHERE id = ${data.ordenItemId}
        FOR UPDATE
      `;
      const item = filas[0];
      if (!item || item.ordenId !== ordenId) {
        throw new BusinessException(
          'ORDEN_ITEM_NOT_FOUND',
          'ESE MATERIAL NO PERTENECE A ESTA ORDEN',
          false,
          404,
        );
      }

      const orden = await tx.ventaOrden.findUnique({
        where: { id: ordenId },
        select: { estado: true, isActive: true },
      });
      if (!orden || !orden.isActive) {
        throw new NotFoundException('LA ORDEN NO EXISTE');
      }
      if (orden.estado !== 'ABIERTA') {
        throw new BusinessException(
          'ORDEN_NO_ABIERTA',
          'SOLO SE PUEDE REGISTRAR CONSUMO MANUAL EN UNA ORDEN ABIERTA',
          false,
          400,
        );
      }

      const disponible = await this.disponibleDeLinea(
        tx,
        item.id,
        item.m3Asignados,
      );
      // Margen mínimo para no rechazar por redondeo de decimales (0.1 + 0.2).
      if (data.m3 > disponible + 1e-6) {
        throw new BusinessException(
          'ORDEN_SIN_CUPO',
          `ESTE MATERIAL SOLO TIENE ${Number(disponible.toFixed(3))} M³ DISPONIBLES EN LA ORDEN`,
          false,
          400,
        );
      }

      await tx.ventaOrdenConsumoManual.create({
        data: {
          ordenId,
          ordenItemId: item.id,
          m3: data.m3,
          viajes: data.viajes ?? null,
          motivo,
          registradoPorId: user.id,
        },
      });

      // Mismo aviso de "material bajo" que dispara un despacho de la app.
      let avisoBajoStockOrdenItemId: number | undefined;
      if (
        disponible - data.m3 <= UMBRAL_BAJO_STOCK_M3 &&
        !item.alertaBajoStockEnviada
      ) {
        await tx.ventaOrdenItem.update({
          where: { id: item.id },
          data: { alertaBajoStockEnviada: true },
        });
        avisoBajoStockOrdenItemId = item.id;
      }

      // Si con esto se consumió todo, la orden pasa sola a COMPLETADA.
      await this.recalcularEstadoOrden(tx, ordenId);
      return avisoBajoStockOrdenItemId;
    });

    this.logger.log(
      `Consumo manual | orden ${ordenId} | línea ${data.ordenItemId} | ${data.m3} m³` +
        (data.viajes ? ` | ${data.viajes} viaje(s)` : '') +
        ` | usuario ${user.id}`,
    );

    if (aviso != null) {
      // Fuera de la transacción: es una llamada de red y no debe deshacer nada.
      void this.avisarBajoStockSiCorresponde(aviso);
    }

    return this.findOne(ordenId);
  }

  /**
   * Anula un consumo manual (solo ADMIN, con motivo). No se borra: queda con
   * quién, cuándo y por qué, y deja de contar para el saldo. Una orden CERRADA
   * o CANCELADA no se toca — esos estados son una decisión, no un cálculo.
   */
  async anularConsumoManual(
    ordenId: number,
    consumoId: number,
    motivoTexto: string,
    user: { id: number; role?: string },
  ) {
    this.asegurarAdmin(user, 'ANULAR UN CONSUMO MANUAL');

    const motivo = (motivoTexto ?? '').trim();
    if (motivo.length < 3) {
      throw new BusinessException(
        'MOTIVO_REQUERIDO',
        'INDIQUE EL MOTIVO DE LA ANULACIÓN',
        false,
        400,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const consumo = await tx.ventaOrdenConsumoManual.findUnique({
        where: { id: consumoId },
        select: {
          id: true,
          ordenId: true,
          ordenItemId: true,
          isActive: true,
          orden: { select: { estado: true } },
          ordenItem: { select: { m3Asignados: true } },
        },
      });
      if (!consumo || consumo.ordenId !== ordenId) {
        throw new NotFoundException('EL CONSUMO MANUAL NO EXISTE');
      }
      if (!consumo.isActive) {
        throw new BusinessException(
          'CONSUMO_YA_ANULADO',
          'ESTE CONSUMO MANUAL YA ESTÁ ANULADO',
          false,
          400,
        );
      }
      if (
        consumo.orden.estado === 'CERRADA' ||
        consumo.orden.estado === 'CANCELADA'
      ) {
        throw new BusinessException(
          'ORDEN_NO_ABIERTA',
          'NO SE PUEDE ANULAR UN CONSUMO DE UNA ORDEN CERRADA O CANCELADA',
          false,
          400,
        );
      }

      await tx.ventaOrdenConsumoManual.update({
        where: { id: consumoId },
        data: {
          isActive: false,
          anuladoPorId: user.id,
          anuladoEn: new Date(),
          motivoAnulacion: motivo,
        },
      });

      // Si la línea vuelve a tener saldo de sobra, se puede avisar de nuevo.
      const disponible = await this.disponibleDeLinea(
        tx,
        consumo.ordenItemId,
        consumo.ordenItem.m3Asignados,
      );
      if (disponible > UMBRAL_BAJO_STOCK_M3) {
        await tx.ventaOrdenItem.update({
          where: { id: consumo.ordenItemId },
          data: { alertaBajoStockEnviada: false },
        });
      }

      // Puede volver de COMPLETADA a ABIERTA.
      await this.recalcularEstadoOrden(tx, ordenId);
    });

    this.logger.log(
      `Consumo manual ${consumoId} anulado | orden ${ordenId} | usuario ${user.id} | ${motivo}`,
    );

    return this.findOne(ordenId);
  }

  /** Pasa a mayúsculas, quita espacios y exige ORD-NNNN-AAAA (número > 0). */
  private normalizarCodigoOrden(texto: string): string {
    const codigo = (texto ?? '').trim().toUpperCase();
    const partes = CODIGO_ORDEN_REGEX.exec(codigo);
    if (!partes || Number(partes[1]) === 0) {
      throw new BusinessException(
        'CODIGO_INVALIDO',
        'EL CÓDIGO DEBE TENER EL FORMATO ORD-NNNN-AAAA (EJ. ORD-0045-2026)',
        false,
        400,
      );
    }
    return codigo;
  }

  /**
   * Cambia el código de una orden. Solo ADMIN.
   *
   * - Código libre: se cambia y el anterior queda libre.
   * - Código de otra orden: sin `intercambiar` se rechaza con CODIGO_OCUPADO
   *   (la web pregunta si se quieren intercambiar); con `intercambiar` las dos
   *   órdenes se cambian el código en una sola transacción.
   *
   * Los despachos, el stock y la app enlazan la orden por su id, nunca por el
   * código, así que nada de eso se ve afectado. Cada cambio queda en
   * VentaOrdenCodigoCambio (en un intercambio, una fila por orden).
   */
  async cambiarCodigo(
    id: number,
    codigoTexto: string,
    intercambiar: boolean,
    user: { id: number; role?: string },
  ) {
    this.asegurarAdmin(user, 'CAMBIAR EL CÓDIGO DE UNA ORDEN');

    const codigoNuevo = this.normalizarCodigoOrden(codigoTexto);

    const orden = await this.prisma.ventaOrden.findUnique({
      where: { id },
      select: { id: true, codigo: true },
    });
    if (!orden) throw new NotFoundException('LA ORDEN NO EXISTE');

    if (orden.codigo === codigoNuevo) {
      throw new BusinessException(
        'CODIGO_SIN_CAMBIO',
        `LA ORDEN YA TIENE EL CÓDIGO ${codigoNuevo}`,
        false,
        400,
      );
    }

    const otra = await this.prisma.ventaOrden.findUnique({
      where: { codigo: codigoNuevo },
      select: {
        id: true,
        isActive: true,
        client: { select: { name: true, companyname: true } },
        constSite: { select: { name: true } },
      },
    });

    if (otra && !intercambiar) {
      const cliente = otra.client.companyname || otra.client.name;
      throw new BusinessException(
        'CODIGO_OCUPADO',
        `LA ${codigoNuevo} YA LA TIENE LA ORDEN DE ${cliente} / ${otra.constSite.name}` +
          (otra.isActive ? '' : ' (ELIMINADA)'),
        false,
        409,
      );
    }

    const codigoAnterior = orden.codigo;

    try {
      const actualizada = await this.prisma.$transaction(async (tx) => {
        if (otra) {
          // El código es UNIQUE y Postgres lo revisa en cada sentencia: la
          // otra orden pasa por un código temporal mientras esta toma el suyo.
          await tx.ventaOrden.update({
            where: { id: otra.id },
            data: { codigo: `TMP-${otra.id}-${Date.now()}` },
          });
          await tx.ventaOrden.update({
            where: { id },
            data: { codigo: codigoNuevo },
          });
          await tx.ventaOrden.update({
            where: { id: otra.id },
            data: { codigo: codigoAnterior },
          });
          await tx.ventaOrdenCodigoCambio.createMany({
            data: [
              {
                ordenId: id,
                codigoAnterior,
                codigoNuevo,
                intercambio: true,
                userId: user.id,
              },
              {
                ordenId: otra.id,
                codigoAnterior: codigoNuevo,
                codigoNuevo: codigoAnterior,
                intercambio: true,
                userId: user.id,
              },
            ],
          });
        } else {
          await tx.ventaOrden.update({
            where: { id },
            data: { codigo: codigoNuevo },
          });
          await tx.ventaOrdenCodigoCambio.create({
            data: { ordenId: id, codigoAnterior, codigoNuevo, userId: user.id },
          });
        }

        return tx.ventaOrden.findUnique({
          where: { id },
          include: ORDEN_INCLUDE,
        });
      });

      this.logger.log(
        otra
          ? `Códigos intercambiados por usuario ${user.id} | orden ${id}: ${codigoAnterior} → ${codigoNuevo} | orden ${otra.id}: ${codigoNuevo} → ${codigoAnterior}`
          : `Código cambiado por usuario ${user.id} | orden ${id}: ${codigoAnterior} → ${codigoNuevo}`,
      );

      return this.formatOrden(actualizada);
    } catch (error) {
      // Otra persona tomó ese código entre la consulta y el guardado.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BusinessException(
          'CODIGO_OCUPADO',
          `EL CÓDIGO ${codigoNuevo} SE ACABA DE ASIGNAR A OTRA ORDEN. INTENTE DE NUEVO.`,
          false,
          409,
        );
      }
      throw error;
    }
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
      // despachadoM3 = app + consumo manual: es lo que descuenta del disponible.
      const { despachadoAppM3, consumoManualM3, despachadoM3, disponibleM3 } =
        consumoDeLinea(item);
      // Detalle de cada despacho real (placa, m³, hora) — para el reporte PDF
      // de la orden. La placa puede faltar (vehículo externo no resuelto), por
      // eso el fallback a lo que el supervisor tecleó en la app.
      const despachos = item.ventas.map((v: any) => ({
        codigo: v.codigo,
        plate: v.plate || v.vehicleIdText,
        m3: v.m3,
        capturedAt: v.capturedAt,
      }));
      const { ventas, ...resto } = item;
      return {
        ...resto,
        despachadoAppM3,
        consumoManualM3,
        despachadoM3,
        disponibleM3,
        excedido: disponibleM3 < 0,
        despachos,
        consumosManuales: item.consumosManuales ?? [],
      };
    });

    const totales = items.reduce(
      (acc: any, i: any) => ({
        asignadoM3: acc.asignadoM3 + i.m3Asignados,
        despachadoAppM3: acc.despachadoAppM3 + i.despachadoAppM3,
        consumoManualM3: acc.consumoManualM3 + i.consumoManualM3,
        despachadoM3: acc.despachadoM3 + i.despachadoM3,
        disponibleM3: acc.disponibleM3 + i.disponibleM3,
      }),
      {
        asignadoM3: 0,
        despachadoAppM3: 0,
        consumoManualM3: 0,
        despachadoM3: 0,
        disponibleM3: 0,
      },
    );

    const { items: crudo, vehiculos, ...resto } = orden;
    return {
      ...resto,
      items,
      totales,
      vehiculos: Array.isArray(vehiculos)
        ? vehiculos.map((v: any) => v.vehicle)
        : [],
    };
  }

  /** El transportista es opcional, pero si viene tiene que existir y estar activo. */
  private async validarTransportista(transportistaId?: number | null) {
    if (transportistaId == null) return;
    const transportista = await this.prisma.transportista.findUnique({
      where: { id: transportistaId },
      select: { isActive: true },
    });
    if (!transportista || !transportista.isActive) {
      throw new BusinessException(
        'TRANSPORTISTA_NOT_FOUND',
        'EL TRANSPORTISTA NO EXISTE',
        false,
        400,
      );
    }
  }

  private async validarVehiculos(vehicleIds: number[]) {
    const unicos = [...new Set(vehicleIds)];
    if (!unicos.length) return unicos;
    const existentes = await this.prisma.vehicle.findMany({
      where: { id: { in: unicos } },
      select: { id: true },
    });
    if (existentes.length !== unicos.length) {
      const encontrados = new Set(existentes.map((v) => v.id));
      const faltantes = unicos.filter((id) => !encontrados.has(id));
      throw new BusinessException(
        'VEHICLE_NOT_FOUND',
        `LOS SIGUIENTES VEHÍCULOS NO EXISTEN: ${faltantes.join(', ')}`,
        false,
        400,
      );
    }
    return unicos;
  }

  async create(data: CreateVentaOrdenDto) {
    await this.validarClienteYObra(data.clientId, data.constSiteId);
    this.validarItemsSinRepetir(data.items);
    await this.validarMateriales(data.items.map((i) => i.materialId));
    const vehicleIds = await this.validarVehiculos(data.vehicleIds ?? []);
    await this.validarTransportista(data.transportistaId);

    const orden = await this.prisma.$transaction(async (tx) => {
      const codigo = await this.generarCodigo(tx);
      return tx.ventaOrden.create({
        data: {
          codigo,
          clientId: data.clientId,
          constSiteId: data.constSiteId,
          empresaVendedora: data.empresaVendedora,
          transportistaId: data.transportistaId ?? null,
          observacion: data.observacion ?? null,
          placas: [...new Set(data.placas ?? [])],
          items: {
            create: data.items.map((i) => ({
              materialId: i.materialId,
              m3Asignados: i.m3Asignados,
            })),
          },
          vehiculos: {
            create: vehicleIds.map((vehicleId) => ({ vehicleId })),
          },
        },
        include: ORDEN_INCLUDE,
      });
    });

    this.logger.log(
      `Orden creada | ${orden.codigo} | cliente ${orden.clientId} | obra ${orden.constSiteId}`,
    );

    // Sin await: si Telegram falla o tarda, la orden ya quedó creada igual.
    void this.telegram
      .notifyNuevaOrden(orden)
      .catch((e) =>
        this.logger.warn(`Aviso por Telegram de ${orden.codigo} falló: ${e}`),
      );

    return this.formatOrden(orden);
  }

  /** Grilla web. Por defecto solo activas: el borrado es lógico. */
  async findAll(query: QueryVentaOrdenesDto) {
    const where: Prisma.VentaOrdenWhereInput = {
      isActive: query.isActive ?? true,
    };
    if (query.clientId != null) where.clientId = query.clientId;
    if (query.constSiteId != null) where.constSiteId = query.constSiteId;
    if (query.estado != null) where.estado = query.estado;
    if (query.empresaVendedora != null) {
      where.empresaVendedora = query.empresaVendedora;
    }
    if (query.transportistaId != null) {
      where.transportistaId = query.transportistaId;
    }

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
  /** Devuelve los materialId realmente tocados (línea nueva, quitada, o con
   *  m3Asignados cambiado) — para la auditoría "editado por" con material. */
  private async syncItems(
    tx: Prisma.TransactionClient,
    ordenId: number,
    items: VentaOrdenItemDto[],
  ): Promise<number[]> {
    const actuales = await tx.ventaOrdenItem.findMany({
      where: { ordenId },
      include: {
        ventas: { where: { isActive: true }, select: { id: true } },
        // Todos, también anulados: la fila de consumo apunta a esta línea y no
        // puede quedar huérfana (y el historial no se pierde).
        consumosManuales: { select: { id: true } },
      },
    });
    const actualesPorMaterial = new Map(actuales.map((a) => [a.materialId, a]));
    const deseados = new Map(items.map((i) => [i.materialId, i]));
    const materialesTocados: number[] = [];

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
      if (actual.consumosManuales.length > 0) {
        throw new BusinessException(
          'ITEM_CON_CONSUMO_MANUAL',
          `NO SE PUEDE QUITAR UN MATERIAL QUE YA TIENE CONSUMO MANUAL REGISTRADO (materialId ${actual.materialId})`,
          false,
          400,
        );
      }
      await tx.ventaOrdenItem.delete({ where: { id: actual.id } });
      materialesTocados.push(actual.materialId);
    }

    for (const item of items) {
      const actual = actualesPorMaterial.get(item.materialId);
      if (!actual || actual.m3Asignados !== item.m3Asignados) {
        materialesTocados.push(item.materialId);
      }
      await tx.ventaOrdenItem.upsert({
        where: { ordenId_materialId: { ordenId, materialId: item.materialId } },
        create: {
          ordenId,
          materialId: item.materialId,
          m3Asignados: item.m3Asignados,
        },
        // Al tocar la línea se puede volver a avisar si vuelve a quedar baja
        // (ej. se le subió el m3Asignados y luego se despacha hasta agotarla).
        update: {
          m3Asignados: item.m3Asignados,
          alertaBajoStockEnviada: false,
        },
      });
    }

    return materialesTocados;
  }

  /**
   * Edita la orden. `clientId` y `constSiteId` no se pueden cambiar — igual
   * que una venta no cambia de vehículo, una orden no cambia de dueño.
   */
  async update(id: number, data: UpdateVentaOrdenDto, userId: number) {
    const existe = await this.prisma.ventaOrden.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('LA ORDEN NO EXISTE');

    if (data.items) {
      this.validarItemsSinRepetir(data.items);
      await this.validarMateriales(data.items.map((i) => i.materialId));
    }
    const vehicleIds =
      data.vehicleIds !== undefined
        ? await this.validarVehiculos(data.vehicleIds)
        : undefined;
    await this.validarTransportista(data.transportistaId);

    const actualizada = await this.prisma.$transaction(async (tx) => {
      let materialesTocados: number[] = [];
      if (data.items) {
        materialesTocados = await this.syncItems(tx, id, data.items);
      }

      if (vehicleIds !== undefined) {
        await tx.ventaOrdenVehiculo.deleteMany({
          where: { ordenId: id, vehicleId: { notIn: vehicleIds } },
        });
        await tx.ventaOrdenVehiculo.createMany({
          data: vehicleIds.map((vehicleId) => ({ ordenId: id, vehicleId })),
          skipDuplicates: true,
        });
      }

      // Qué material(es) cambiaron en esta misma edición, para mostrarlo junto
      // a "editado por". Null si esta edición no tocó ninguna línea.
      let editadoMaterial: string | null = null;
      const materialesUnicos = [...new Set(materialesTocados)];
      if (materialesUnicos.length > 0) {
        const materiales = await tx.material.findMany({
          where: { id: { in: materialesUnicos } },
          select: { materialType: true },
        });
        editadoMaterial = materiales.map((m) => m.materialType).join(',');
      }

      // Siempre se marca quién editó y cuándo — es la única persona que se
      // guarda (no un historial), así que toda edición la pisa.
      await tx.ventaOrden.update({
        where: { id },
        data: {
          editadoPorId: userId,
          editadoEn: new Date(),
          editadoMaterial,
          ...(data.empresaVendedora !== undefined && {
            empresaVendedora: data.empresaVendedora,
          }),
          ...(data.transportistaId !== undefined && {
            transportistaId: data.transportistaId,
          }),
          ...(data.observacion !== undefined && {
            observacion: data.observacion,
          }),
          ...(data.placas !== undefined && {
            placas: [...new Set(data.placas)],
          }),
        },
      });

      // Las líneas pudieron cambiar de asignado: el estado se recalcula por
      // si acaba de completarse o de dejar de estarlo.
      await this.recalcularEstadoOrden(tx, id);

      return tx.ventaOrden.findUnique({
        where: { id },
        include: ORDEN_INCLUDE,
      });
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

    // Un consumo manual activo también es material ya entregado contra la orden.
    const conConsumo = await this.prisma.ventaOrdenConsumoManual.findFirst({
      where: { ordenId: id, isActive: true },
      select: { id: true },
    });
    if (conConsumo) {
      throw new BusinessException(
        'ORDEN_CON_CONSUMO_MANUAL',
        'NO SE PUEDE ELIMINAR UNA ORDEN QUE YA TIENE CONSUMO MANUAL REGISTRADO. ANÚLELO PRIMERO.',
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
        client: {
          select: { id: true, name: true, companyname: true, type: true },
        },
        constSite: { select: { id: true, name: true } },
        transportista: { select: { id: true, name: true } },
        items: {
          include: {
            material: { select: { id: true, materialType: true } },
            ventas: { where: { isActive: true }, select: { m3: true } },
            consumosManuales: CONSUMOS_ACTIVOS,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const porCliente = new Map<number, any>();

    for (const orden of ordenes) {
      const items = orden.items
        .map((item) => {
          // Incluye el consumo manual: la app debe ver el mismo disponible que la web.
          const { despachadoM3, disponibleM3 } = consumoDeLinea(item);
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

      obra.ordenes.push({
        ordenId: orden.id,
        codigo: orden.codigo,
        empresaVendedora: orden.empresaVendedora,
        // La app solo pide transportista si la orden lo tiene.
        transportista: orden.transportista ?? null,
        items,
      });
      cliente.obras.set(orden.constSiteId, obra);
      porCliente.set(orden.clientId, cliente);
    }

    return [...porCliente.values()].map((cliente) => ({
      ...cliente,
      obras: [...cliente.obras.values()],
    }));
  }

  /**
   * Vehículo para una orden a partir de placa y cubicaje. Si la placa ya existe
   * se devuelve ese vehículo (sin tocar su cubicaje). Si no, se crea: externo
   * con el proveedor del cliente público (creándolo si aún no existe), o
   * interno de la empresa para un cliente privado.
   */
  /** ABC1234 o ABC123: sin guion, en mayúsculas, 3 letras y 3 o 4 números (igual que Vehículos). */
  private normalizarPlaca(texto: string): string {
    const plate = texto.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!/^[A-Z]{3}\d{3,4}$/.test(plate)) {
      throw new BusinessException(
        'PLACA_INVALIDA',
        'LA PLACA DEBE TENER 3 LETRAS Y 3 O 4 NÚMEROS, SIN GUION (ABC123 o ABC1234)',
        false,
        400,
      );
    }
    return plate;
  }

  /** Vehículo ya registrado con esa placa, o null: para autocompletar su cubicaje. */
  async buscarVehiculoPorPlaca(texto: string) {
    const plate = this.normalizarPlaca(texto);
    return this.prisma.vehicle.findUnique({
      where: { plate },
      select: VEHICULO_ORDEN_SELECT,
    });
  }

  async resolverVehiculo(data: ResolverVehiculoOrdenDto) {
    const plate = this.normalizarPlaca(data.plate);

    // Si ya existe se usa con su cubicaje real: no se duplica ni se pisa.
    const existente = await this.prisma.vehicle.findUnique({
      where: { plate },
      select: VEHICULO_ORDEN_SELECT,
    });
    if (existente) return existente;

    const cliente = await this.prisma.client.findUnique({
      where: { id: data.clientId },
      select: { id: true, ruc: true, companyname: true, type: true },
    });
    if (!cliente) throw new NotFoundException('EL CLIENTE NO EXISTE');

    try {
      if (cliente.type === 'PUBLICO') {
        return await this.prisma.$transaction(async (tx) => {
          const proveedor = await asegurarProveedorPorRuc(
            tx,
            cliente.ruc,
            cliente.companyname,
          );
          return tx.vehicle.create({
            data: {
              vehicleid: await siguienteIdVehiculoExterno(tx),
              plate,
              capacity: data.capacity,
              type: 'EXTERNO',
              ownerId: proveedor.id,
            },
            select: VEHICULO_ORDEN_SELECT,
          });
        });
      }

      const vehicleid = data.vehicleid?.trim().toUpperCase();
      if (!vehicleid || !data.company) {
        throw new BusinessException(
          'DATOS_VEHICULO_INTERNO',
          'PARA UN VEHÍCULO DE LA EMPRESA INDIQUE SU ID Y LA EMPRESA',
          false,
          400,
        );
      }
      return await this.prisma.vehicle.create({
        data: {
          vehicleid,
          plate,
          capacity: data.capacity,
          type: 'INTERNO',
          company: data.company,
        },
        select: VEHICULO_ORDEN_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const campos = String(error.meta?.target ?? '');
        throw new BusinessException(
          'VEHICULO_DUPLICADO',
          campos.includes('vehicleid')
            ? `YA EXISTE UN VEHÍCULO CON EL ID ${data.vehicleid}`
            : `YA EXISTE UN VEHÍCULO CON LA PLACA ${plate}`,
          false,
          409,
        );
      }
      throw error;
    }
  }
}
