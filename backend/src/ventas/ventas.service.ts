import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import { CreateVentaDto } from './DTOs/create-venta.dto';
import { UpdateVentaDto } from './DTOs/update-venta.dto';
import { QueryVentasDto } from './DTOs/query-ventas.dto';
import { VentasStockService } from './ventas-stock.service';
import { VentasOrdenesService } from './ventas-ordenes.service';

/** Lo que la grilla y el detalle necesitan siempre. */
const VENTA_INCLUDE = {
  cantera: {
    select: {
      id: true,
      nombre: true,
      materialProvider: { select: { id: true, razonsocial: true } },
    },
  },
  vehicle: {
    select: {
      id: true,
      vehicleid: true,
      plate: true,
      brand: true,
      model: true,
      // INTERNO / EXTERNO no se guarda en la venta: se lee de aquí. Duplicarlo
      // crearía dos fuentes que se contradicen si el vehículo se reclasifica.
      type: true,
      company: true,
      capacity: true,
    },
  },
  material: { select: { id: true, materialType: true } },
  user: { select: { id: true, name: true } },
  // El comprador es un cliente registrado. `comprador` guarda además su nombre
  // del momento, por si el cliente se renombra o se da de baja después.
  // `type` viaja para que la grilla distinga Interna (PRIVADO) de Externa
  // (PUBLICO) sin una consulta aparte.
  compradorCliente: {
    select: { id: true, name: true, companyname: true, ruc: true, type: true },
  },
  orden: { select: { id: true, codigo: true } },
  constSite: { select: { id: true, name: true } },
} satisfies Prisma.VentaCanteraInclude;

@Injectable()
export class VentasService {
  private readonly logger = new Logger(VentasService.name);

  constructor(
    private prisma: PrismaService,
    private stock: VentasStockService,
    private ordenes: VentasOrdenesService,
  ) {}

  private getRelativePath(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  }

  /**
   * Resuelve el comprador de una venta. Los compradores son los clientes ya
   * registrados: no existe un catálogo aparte.
   *
   * No reintentable a propósito: reenviar la venta mil veces no va a hacer que
   * el cliente exista ni que vuelva a estar activo. Reintentarlo solo retrasaría
   * 72 horas el momento en que alguien se entera del problema.
   */
  private async resolverComprador(compradorId: number) {
    if (!Number.isInteger(compradorId) || compradorId <= 0) {
      throw new BusinessException(
        'COMPRADOR_REQUERIDO',
        'LA VENTA DEBE INDICAR A QUÉ CLIENTE SE LE VENDIÓ',
        false,
      );
    }

    const cliente = await this.prisma.client.findUnique({
      where: { id: compradorId },
      select: { id: true, companyname: true, isActive: true },
    });

    if (!cliente) {
      throw new BusinessException(
        'COMPRADOR_NOT_FOUND',
        'EL CLIENTE COMPRADOR NO EXISTE',
        false,
      );
    }

    if (!cliente.isActive) {
      throw new BusinessException(
        'COMPRADOR_INACTIVO',
        `EL CLIENTE ${cliente.companyname} ESTÁ DADO DE BAJA`,
        false,
      );
    }

    return cliente;
  }

  /**
   * Convierte una fecha suelta ("2026-09-30") en el instante que corresponde en
   * Ecuador (UTC-5), no en UTC.
   *
   * Sin esto, `hasta = 2026-09-30` se interpreta como medianoche UTC, que son
   * las 19:00 del día 29 en Ecuador: el filtro dejaba fuera casi todo el último
   * día del rango. Y `desde` colaba despachos de la tarde del día anterior.
   *
   * Un valor con hora explícita se respeta tal cual.
   */
  private limiteDelDia(valor: string, fin: boolean): Date {
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
    if (!soloFecha) return new Date(valor);

    return new Date(
      fin ? `${valor}T23:59:59.999-05:00` : `${valor}T00:00:00.000-05:00`,
    );
  }

  /**
   * Registra una venta enviada por la app.
   *
   * Es idempotente por `uuid`: la app lo genera al abrir el formulario, así que
   * un doble toque o un reenvío del worker caen en el mismo registro en vez de
   * duplicarlo. Aquí no existe el guard anti-duplicado de 10 minutos del flujo
   * de obra — no puede existir: el mismo QR de cantera se escanea decenas de
   * veces al día, una por camión que sale.
   */
  async create(userId: number, data: CreateVentaDto, files: any) {
    // Atajo para el reenvío: evita el trabajo de resolver QR, material y
    // vehículo, y sobre todo deja el log honesto (un reenvío no "registra"
    // nada). El upsert de abajo sigue siendo la garantía real ante dos envíos
    // simultáneos que pasen los dos por aquí.
    const yaRegistrada = await this.prisma.ventaCantera.findUnique({
      where: { uuid: data.uuid },
      include: VENTA_INCLUDE,
    });
    if (yaRegistrada) {
      this.logger.log(
        `Venta ${yaRegistrada.id}: reenvío del uuid ${data.uuid}, se devuelve la ya registrada`,
      );
      return yaRegistrada;
    }

    const qrcode = (data.qrcode ?? '').trim().toUpperCase();

    const ventaQr = await this.prisma.canteraVentaQr.findUnique({
      where: { qrcode },
      select: { canteraId: true, isActive: true },
    });

    if (!ventaQr) {
      // No reintentable: reenviarlo mil veces no va a hacer que el QR exista.
      throw new BusinessException(
        'VENTA_QR_NOT_FOUND',
        `EL QR ${qrcode} NO CORRESPONDE A NINGUNA CANTERA DE VENTA`,
        false,
      );
    }

    // Un punto de venta dado de baja NO invalida los despachos que ya ocurrieron.
    // Las ventas se acumulan días en el teléfono antes de subir: si en ese lapso
    // alguien desactiva el QR, rechazarlas las marcaría FAILED para siempre y el
    // dato se perdería. La baja vale hacia adelante — impide escanear, no borrar
    // lo ya registrado.
    if (!ventaQr.isActive) {
      this.logger.warn(
        `Venta ${data.uuid}: el QR ${qrcode} está dado de baja. Se acepta igual porque el despacho ya ocurrió.`,
      );
    }

    const ordenItemId =
      data.ordenItemId != null ? Number(data.ordenItemId) : null;

    // Si la venta pertenece a una orden, el material se deriva de esa línea
    // DENTRO de la transacción (resolverOrdenItem), no de este campo suelto.
    // Si no, sigue exactamente como hoy: se valida el material tecleado antes
    // de abrir la transacción.
    let materialId: number | null = null;
    if (ordenItemId == null) {
      if (data.materialId == null || data.materialId === '') {
        throw new BusinessException(
          'MATERIAL_REQUERIDO',
          'LA VENTA DEBE INDICAR EL MATERIAL O LA ORDEN',
          false,
        );
      }

      materialId = Number(data.materialId);
      const material = await this.prisma.material.findUnique({
        where: { id: materialId },
        select: { id: true },
      });
      if (!material) {
        throw new BusinessException(
          'MATERIAL_NOT_FOUND',
          'EL MATERIAL NO EXISTE',
          false,
        );
      }
    }

    // El comprador es un cliente registrado. A diferencia del vehículo, acá sí
    // se rechaza: el id lo eligió el supervisor de una lista que salió del
    // catálogo, así que si no resuelve es que el catálogo del teléfono quedó
    // viejo o el cliente se dio de baja — y eso hay que verlo, no adivinarlo.
    const comprador = await this.resolverComprador(Number(data.compradorId));

    // El vehículo puede no estar en el catálogo (externo recién dado de alta,
    // o teléfono sin sincronizar). No se rechaza: el camión ya salió, negar el
    // registro no lo devuelve a la cantera. Queda con vehicleId null y la web
    // lo muestra marcado para que un ADMIN lo complete.
    const vehicleIdText = data.vehicleIdText.trim();
    // La app envía la PLACA, que es lo que el supervisor lee en el camión. Se
    // sigue aceptando el ID interno porque las ventas viejas —y las que estén en
    // la cola de un teléfono sin actualizar— lo mandan así.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        OR: [
          { plate: { equals: vehicleIdText, mode: 'insensitive' } },
          { vehicleid: { equals: vehicleIdText, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        plate: true,
        driver: { select: { name: true } },
      },
    });

    if (!vehicle) {
      this.logger.warn(
        `Venta ${data.uuid}: vehículo "${vehicleIdText}" no encontrado en el catálogo. Se registra sin vincular.`,
      );
    }

    const fotos = {
      platePath: files?.plate?.[0]
        ? this.getRelativePath(files.plate[0].path)
        : null,
      materialPath: files?.material?.[0]
        ? this.getRelativePath(files.material[0].path)
        : null,
      driverPath: files?.driver?.[0]
        ? this.getRelativePath(files.driver[0].path)
        : null,
      vehiclePath: files?.vehicle?.[0]
        ? this.getRelativePath(files.vehicle[0].path)
        : null,
    };

    const m3 = Number(data.m3);

    // La venta, la resolución de la orden y el descuento de stock se escriben
    // juntas o no se escribe ninguna: un despacho registrado que no consumió
    // saldo deja el stock mintiendo, y es un error que nadie detecta hasta que
    // falta material.
    const venta = await this.prisma.$transaction(async (tx) => {
      let ordenId: number | null = null;
      let constSiteId: number | null = null;

      if (ordenItemId != null) {
        const resuelto = await this.ordenes.resolverOrdenItem(tx, ordenItemId, m3);
        ordenId = resuelto.ordenId;
        constSiteId = resuelto.constSiteId;
        materialId = resuelto.materialId;
      }

      // `update: {}` es lo que hace idempotente el reenvío: si el uuid ya existe
      // se devuelve el registro tal como quedó, sin pisarlo con datos repetidos.
      const registrada = await tx.ventaCantera.upsert({
        where: { uuid: data.uuid },
        create: {
          uuid: data.uuid,
          userId,
          canteraId: ventaQr.canteraId,
          qrcode,
          vehicleId: vehicle?.id ?? null,
          vehicleIdText,
          plate: vehicle?.plate ?? null,
          driverName: vehicle?.driver?.name ?? null,
          materialId: materialId!,
          m3,
          compradorId: comprador.id,
          // La copia la escribe el servidor desde el cliente, no la app: así el
          // nombre guardado no depende de lo que el teléfono haya mandado.
          comprador: comprador.companyname,
          observation: data.observation ?? null,
          lat: data.lat != null ? Number(data.lat) : null,
          lng: data.lng != null ? Number(data.lng) : null,
          capturedAt: new Date(data.capturedAt),
          ordenId,
          ordenItemId,
          constSiteId,
          ...fotos,
        },
        update: {},
        include: VENTA_INCLUDE,
      });

      await this.stock.registrarSalida(tx, {
        ventaId: registrada.id,
        canteraId: registrada.canteraId,
        materialId: registrada.materialId,
        m3: registrada.m3,
        capturedAt: registrada.capturedAt,
      });

      if (ordenId != null) {
        await this.ordenes.recalcularEstadoOrden(tx, ordenId);
      }

      return registrada;
    });

    this.logger.log(
      `Venta registrada | ${venta.id} | cantera ${venta.canteraId} | ${vehicleIdText} | ${venta.m3} m3`,
    );

    return venta;
  }

  /** Grilla web. Solo activas: el borrado es lógico. */
  findAll(query: QueryVentasDto) {
    const where: Prisma.VentaCanteraWhereInput = { isActive: true };

    if (query.canteraId != null) where.canteraId = query.canteraId;
    if (query.vehicleId != null) where.vehicleId = query.vehicleId;
    if (query.materialId != null) where.materialId = query.materialId;
    if (query.ordenId != null) where.ordenId = query.ordenId;

    // Se filtra por capturedAt, la hora real del despacho. Filtrar por createdAt
    // dejaría fuera de "hoy" una venta que salió hoy y se sincronizó mañana.
    if (query.desde || query.hasta) {
      where.capturedAt = {};
      if (query.desde) where.capturedAt.gte = this.limiteDelDia(query.desde, false);
      if (query.hasta) where.capturedAt.lte = this.limiteDelDia(query.hasta, true);
    }

    return this.prisma.ventaCantera.findMany({
      where,
      include: VENTA_INCLUDE,
      orderBy: { capturedAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const venta = await this.prisma.ventaCantera.findUnique({
      where: { id },
      include: VENTA_INCLUDE,
    });
    if (!venta) throw new NotFoundException('LA VENTA NO EXISTE');
    return venta;
  }

  /** Historial del supervisor en la app. */
  findByUser(userId: number) {
    return this.prisma.ventaCantera.findMany({
      where: { userId, isActive: true },
      include: VENTA_INCLUDE,
      orderBy: { capturedAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Corregir los m³ de una venta tiene que mover el saldo: si no, el stock
   * seguiría descontando la cantidad vieja y nadie lo notaría hasta el inventario.
   */
  async update(id: number, data: UpdateVentaDto) {
    await this.findOne(id);

    // Cambiar el comprador rehace también su copia: si se guardara solo el id,
    // la grilla seguiría mostrando el nombre del cliente anterior.
    const { compradorId, ...resto } = data;
    const comprador =
      compradorId != null ? await this.resolverComprador(compradorId) : null;

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.ventaCantera.update({
        where: { id },
        data: {
          ...resto,
          ...(comprador && {
            compradorId: comprador.id,
            comprador: comprador.companyname,
          }),
        },
        include: VENTA_INCLUDE,
      });

      if (data.m3 != null) {
        await this.stock.ajustarSalida(tx, id, Number(data.m3));

        if (actualizada.ordenId != null) {
          await this.ordenes.recalcularEstadoOrden(tx, actualizada.ordenId);
        }
      }

      return actualizada;
    });
  }

  /**
   * Eliminación lógica, igual que en el resto del sistema: la fila queda para el
   * histórico y desaparece de la grilla. El material vuelve al saldo — si la
   * venta no ocurrió, esos m³ siguen en la cantera.
   */
  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const anulada = await tx.ventaCantera.update({
        where: { id },
        data: { isActive: false },
      });

      await this.stock.revertirSalida(tx, id);

      if (anulada.ordenId != null) {
        await this.ordenes.recalcularEstadoOrden(tx, anulada.ordenId);
      }

      return anulada;
    });
  }

  /**
   * Datos que la app necesita al teclear el ID del vehículo: placa y chofer del
   * momento. Ambos se guardan como copia en la venta porque el chofer de un
   * vehículo cambia y el histórico debe conservar quién manejaba ese día.
   */
  async findVehiculo(vehicleid: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        vehicleid: { equals: (vehicleid ?? '').trim(), mode: 'insensitive' },
        isActive: true,
      },
      select: {
        id: true,
        vehicleid: true,
        plate: true,
        brand: true,
        model: true,
        type: true,
        capacity: true,
        driver: { select: { id: true, name: true } },
      },
    });

    if (!vehicle) throw new NotFoundException('EL VEHÍCULO NO EXISTE');
    return vehicle;
  }

  /**
   * Consumo de ventas, agrupado por cantera, material, vehículo, comprador,
   * orden y tipo de cliente. Las agrupaciones son siempre sumas de lo
   * despachado en el rango filtrado; el bloque `stock` es aparte, y es el
   * único que muestra un saldo (el de cantera, siempre el actual).
   */
  async reporteConsumo(query: QueryVentasDto) {
    const ventas = await this.findAll(query);

    const totalM3 = ventas.reduce((acc, v) => acc + (v.m3 ?? 0), 0);

    const agrupar = <K extends string | number>(
      clave: (v: (typeof ventas)[number]) => K | null,
      etiqueta: (v: (typeof ventas)[number]) => string,
    ) => {
      const mapa = new Map<K, { etiqueta: string; m3: number; viajes: number }>();
      for (const venta of ventas) {
        const k = clave(venta);
        if (k == null) continue;
        const actual = mapa.get(k) ?? {
          etiqueta: etiqueta(venta),
          m3: 0,
          viajes: 0,
        };
        actual.m3 += venta.m3 ?? 0;
        actual.viajes += 1;
        mapa.set(k, actual);
      }
      return [...mapa.entries()]
        .map(([id, valor]) => ({ id, ...valor }))
        .sort((a, b) => b.m3 - a.m3);
    };

    return {
      totales: { viajes: ventas.length, m3: totalM3 },
      porCantera: agrupar(
        (v) => v.canteraId,
        (v) => v.cantera?.nombre ?? '—',
      ),
      porMaterial: agrupar(
        (v) => v.materialId,
        (v) => v.material?.materialType ?? '—',
      ),
      // Se agrupa por el texto tecleado, no por vehicleId: así los despachos de
      // un vehículo que no está en el catálogo también quedan contabilizados.
      porVehiculo: agrupar(
        (v) => v.vehicleIdText,
        (v) => v.plate ?? v.vehicleIdText,
      ),
      // Cuánto le vendimos a cada cliente. Es lo que el comprador como texto
      // libre no permitía calcular: el mismo cliente escrito de tres formas
      // aparecía como tres compradores distintos.
      porComprador: agrupar(
        (v) => v.compradorId,
        (v) => v.compradorCliente?.companyname ?? v.comprador ?? '—',
      ),
      // Cuánto se despachó por cada pedido. Las ventas sin orden (todavía la
      // mayoría, hasta que la app la mande siempre) quedan fuera del grupo,
      // igual que quedan fuera de porMaterial las que no tienen material.
      porOrden: agrupar(
        (v) => v.ordenId,
        (v) => v.orden?.codigo ?? '—',
      ),
      // Interna (PRIVADO, obra propia) vs Externa (PUBLICO, cliente de
      // afuera). Mismo ClientType que ya distingue esto en todo el sistema.
      porTipoCliente: agrupar(
        (v) => v.compradorCliente?.type ?? null,
        (v) => (v.compradorCliente?.type === 'PRIVADO' ? 'Interna' : 'Externa'),
      ),
      // El saldo es siempre el actual, no el del rango de fechas filtrado: un
      // "disponible" de hace tres meses no le sirve a nadie para decidir hoy.
      stock: await this.stock.getStockGeneral(query.canteraId),
      movimientos: ventas,
    };
  }
}
