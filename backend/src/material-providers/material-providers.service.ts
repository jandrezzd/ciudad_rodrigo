import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialProviderDto } from './DTOs/create-material-provider.dto';
import { UpdateMaterialProviderDto } from './DTOs/update-material-provider.dto';
import { CreatecanteraDto } from './DTOs/create-cantera.dto';
import { CanteraMaterialDto } from './DTOs/cantera-material.dto';

/** Cantera con sus materiales y el consumo ya registrado */
const CANTERA_INCLUDE = {
  materiales: {
    include: {
      material: true,
      movimientos: { select: { m3: true, toneladas: true } },
    },
  },
} satisfies Prisma.CanteraInclude;

@Injectable()
export class MaterialProvidersService {
  constructor(private prisma: PrismaService) {}

  /**
   * El saldo se deriva del libro mayor, nunca de un contador mutable:
   * disponible = asignado - SUM(movimientos). Así las correcciones posteriores
   * de m3 y los reenvíos de la app offline no lo desajustan.
   */
  private formatCanteraMaterial(cm: any) {
    const consumidoM3 = cm.movimientos.reduce(
      (total: number, mov: any) => total + (mov.m3 ?? 0),
      0,
    );
    const consumidoToneladas = cm.movimientos.reduce(
      (total: number, mov: any) => total + (mov.toneladas ?? 0),
      0,
    );

    const asignadoM3 = cm.metrosCubicos ?? 0;
    const asignadoToneladas = cm.toneladas ?? 0;
    const disponibleM3 = asignadoM3 - consumidoM3;
    const disponibleToneladas = asignadoToneladas - consumidoToneladas;

    const { movimientos, ...resto } = cm;
    return {
      ...resto,
      consumidoM3,
      consumidoToneladas,
      disponibleM3,
      disponibleToneladas,
      // Se despachó más de lo asignado. No es un error del sistema: con la app
      // offline el viaje ya ocurrió, así que se registra y se marca.
      excedido: disponibleM3 < 0 || disponibleToneladas < 0,
    };
  }

  private formatProvider(provider: any) {
    if (!provider) return provider;
    return {
      ...provider,
      canteras: (provider.canteras ?? []).map((cantera: any) => ({
        ...cantera,
        materiales: (cantera.materiales ?? []).map((cm: any) =>
          this.formatCanteraMaterial(cm),
        ),
      })),
    };
  }

  private toMaterialData(material: CanteraMaterialDto) {
    return {
      materialId: material.materialId,
      toneladas: material.toneladas ?? null,
      metrosCubicos: material.metrosCubicos ?? null,
      factor: material.factor ?? null,
      direccionConversion: material.direccionConversion ?? 'TN_A_M3',
    };
  }

  private async validarMateriales(canteras: CreatecanteraDto[]) {
    const materialIds = [
      ...new Set(
        canteras.flatMap((c) => (c.materiales ?? []).map((m) => m.materialId)),
      ),
    ];
    if (materialIds.length === 0) return;

    const existentes = await this.prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true },
    });

    if (existentes.length !== materialIds.length) {
      const encontrados = new Set(existentes.map((m) => m.id));
      const faltantes = materialIds.filter((id) => !encontrados.has(id));
      throw new BadRequestException(
        `Los siguientes materiales no existen: ${faltantes.join(', ')}`,
      );
    }

    for (const cantera of canteras) {
      const ids = (cantera.materiales ?? []).map((m) => m.materialId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException(
          `La cantera "${cantera.nombre}" tiene materiales repetidos`,
        );
      }
    }
  }

  /**
   * Sincroniza los materiales de una cantera conservando los movimientos ya
   * registrados: actualiza los que siguen, crea los nuevos y borra los que se
   * quitaron. Un material con consumo registrado no se puede quitar.
   */
  private async syncMateriales(
    tx: Prisma.TransactionClient,
    canteraId: number,
    materiales: CanteraMaterialDto[],
  ) {
    const actuales = await tx.canteraMaterial.findMany({
      where: { canteraId },
      include: { _count: { select: { movimientos: true } } },
    });

    const deseados = new Map(materiales.map((m) => [m.materialId, m]));

    for (const actual of actuales) {
      if (deseados.has(actual.materialId)) continue;
      if (actual._count.movimientos > 0) {
        throw new BadRequestException(
          `No se puede quitar un material que ya tiene despachos registrados (materialId ${actual.materialId})`,
        );
      }
      await tx.canteraMaterial.delete({ where: { id: actual.id } });
    }

    for (const material of materiales) {
      await tx.canteraMaterial.upsert({
        where: {
          canteraId_materialId: { canteraId, materialId: material.materialId },
        },
        create: { canteraId, ...this.toMaterialData(material) },
        update: this.toMaterialData(material),
      });
    }
  }

  /**
   * Sincroniza las canteras del proveedor SIN borrarlas y recrearlas: hacerlo
   * cambiaría sus ids y arrastraría en cascada las planificaciones asignadas
   * y todo el historial de consumo.
   */
  private async syncCanteras(
    tx: Prisma.TransactionClient,
    materialProviderId: number,
    canteras: CreatecanteraDto[],
  ) {
    const actuales = await tx.cantera.findMany({
      where: { materialProviderId },
      select: { id: true },
    });

    const idsRecibidos = new Set(
      canteras.map((c) => c.id).filter((id): id is number => id != null),
    );

    const aEliminar = actuales
      .filter((c) => !idsRecibidos.has(c.id))
      .map((c) => c.id);

    if (aEliminar.length > 0) {
      const conMovimientos = await tx.canteraMaterialMovimiento.findFirst({
        where: { canteraMaterial: { canteraId: { in: aEliminar } } },
        select: { canteraMaterial: { select: { canteraId: true } } },
      });
      if (conMovimientos) {
        throw new BadRequestException(
          `No se puede eliminar una cantera con despachos registrados (canteraId ${conMovimientos.canteraMaterial.canteraId})`,
        );
      }
      await tx.cantera.deleteMany({ where: { id: { in: aEliminar } } });
    }

    for (const cantera of canteras) {
      const { id, materiales, ...datos } = cantera;

      const guardada =
        id != null
          ? await tx.cantera.update({ where: { id }, data: datos })
          : await tx.cantera.create({ data: { ...datos, materialProviderId } });

      if (materiales !== undefined) {
        await this.syncMateriales(tx, guardada.id, materiales);
      }
    }
  }

  async create(createMaterialProviderDto: CreateMaterialProviderDto) {
    const { canteras, ...providerData } = createMaterialProviderDto;
    await this.validarMateriales(canteras ?? []);

    const provider = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.materialProvider.create({ data: providerData });
      await this.syncCanteras(tx, creado.id, canteras ?? []);
      return creado;
    });

    return this.findOne(provider.id);
  }

  async findAll() {
    const providers = await this.prisma.materialProvider.findMany({
      include: { canteras: { include: CANTERA_INCLUDE } },
      orderBy: { id: 'asc' },
    });
    return providers.map((p) => this.formatProvider(p));
  }

  async findOne(id: number) {
    const provider = await this.prisma.materialProvider.findUnique({
      where: { id },
      include: { canteras: { include: CANTERA_INCLUDE } },
    });
    if (!provider) {
      throw new NotFoundException('El proveedor de material no existe');
    }
    return this.formatProvider(provider);
  }

  async update(id: number, updateMaterialProviderDto: UpdateMaterialProviderDto) {
    const { canteras, ...providerData } = updateMaterialProviderDto;

    const existe = await this.prisma.materialProvider.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) {
      throw new NotFoundException('El proveedor de material no existe');
    }

    if (canteras) await this.validarMateriales(canteras);

    await this.prisma.$transaction(async (tx) => {
      await tx.materialProvider.update({ where: { id }, data: providerData });
      if (canteras !== undefined) {
        await this.syncCanteras(tx, id, canteras);
      }
    });

    return this.findOne(id);
  }

  async remove(id: number) {
    const conMovimientos = await this.prisma.canteraMaterialMovimiento.findFirst({
      where: { canteraMaterial: { cantera: { materialProviderId: id } } },
      select: { id: true },
    });
    if (conMovimientos) {
      throw new BadRequestException(
        'No se puede eliminar un proveedor con despachos registrados. Desactívelo en su lugar.',
      );
    }

    return this.prisma.materialProvider.delete({ where: { id } });
  }

  /** Saldos de todas las canteras de un proveedor, con el total consolidado */
  async getSaldosByProveedor(id: number) {
    const provider = await this.findOne(id);

    const canteras = provider.canteras ?? [];
    const totales = canteras
      .flatMap((c: any) => c.materiales ?? [])
      .reduce(
        (acc: any, m: any) => ({
          asignadoM3: acc.asignadoM3 + (m.metrosCubicos ?? 0),
          asignadoToneladas: acc.asignadoToneladas + (m.toneladas ?? 0),
          consumidoM3: acc.consumidoM3 + (m.consumidoM3 ?? 0),
          consumidoToneladas: acc.consumidoToneladas + (m.consumidoToneladas ?? 0),
          disponibleM3: acc.disponibleM3 + (m.disponibleM3 ?? 0),
          disponibleToneladas: acc.disponibleToneladas + (m.disponibleToneladas ?? 0),
        }),
        {
          asignadoM3: 0,
          asignadoToneladas: 0,
          consumidoM3: 0,
          consumidoToneladas: 0,
          disponibleM3: 0,
          disponibleToneladas: 0,
        },
      );

    return {
      id: provider.id,
      ruc: provider.ruc,
      razonsocial: provider.razonsocial,
      nombreComercial: provider.nombreComercial,
      canteras,
      totales,
    };
  }

  /** Saldos de una cantera: asignado, consumido y disponible por material */
  async getSaldosByCantera(canteraId: number) {
    const cantera = await this.prisma.cantera.findUnique({
      where: { id: canteraId },
      include: {
        materialProvider: {
          select: { id: true, ruc: true, razonsocial: true, nombreComercial: true },
        },
        ...CANTERA_INCLUDE,
      },
    });

    if (!cantera) {
      throw new NotFoundException('La cantera no existe');
    }

    return {
      ...cantera,
      materiales: cantera.materiales.map((cm) => this.formatCanteraMaterial(cm)),
    };
  }

  /** Todo lo que hace falta para auditar un despacho: viaje, vehículo, conductor y destino */
  private static readonly MOVIMIENTO_INCLUDE = {
    canteraMaterial: {
      include: {
        material: true,
        cantera: { select: { id: true, nombre: true, materialProviderId: true } },
      },
    },
    trip: {
      select: {
        id: true,
        uuid: true,
        planningId: true,
        departureAt: true,
        arrivalAt: true,
        status: true,
        deviationM3: true,
        vehicle: {
          select: {
            id: true,
            vehicleid: true,
            plate: true,
            brand: true,
            model: true,
            type: true,
            company: true,
            // Conductor asignado HOY: si difiere del que hizo el viaje, hubo cambio
            driver: { select: { id: true, name: true, document: true } },
            owner: { select: { id: true, companyname: true } },
          },
        },
        // Conductor que hizo el viaje (foto tomada al registrar la salida)
        driver: { select: { id: true, name: true, document: true, phone: true } },
        planning: { select: { id: true, planningCode: true } },
        constSite: { select: { id: true, name: true } },
        client: { select: { id: true, companyname: true } },
        departure: { select: { m3: true, m3Corrected: true, capturedAt: true, source: true } },
        arrival: { select: { m3: true, m3Corrected: true, capturedAt: true } },
      },
    },
  } satisfies Prisma.CanteraMaterialMovimientoInclude;

  /**
   * Marca si el conductor que hizo el viaje ya no es el asignado al vehículo.
   * Sirve para explicar por qué un mismo vehículo aparece con distintos nombres
   * a lo largo del historial.
   */
  private formatMovimiento(mov: any) {
    const conductorViaje = mov.trip?.driver ?? null;
    const conductorActual = mov.trip?.vehicle?.driver ?? null;

    return {
      ...mov,
      conductorViaje,
      conductorActual,
      cambioDeConductor:
        conductorViaje != null &&
        conductorActual != null &&
        conductorViaje.id !== conductorActual.id,
    };
  }

  /** Movimientos de una cantera, ordenados por el momento REAL del despacho */
  async getMovimientosByCantera(canteraId: number) {
    const movimientos = await this.prisma.canteraMaterialMovimiento.findMany({
      where: { canteraMaterial: { canteraId } },
      include: MaterialProvidersService.MOVIMIENTO_INCLUDE,
      orderBy: { capturedAt: 'desc' },
    });

    return movimientos.map((mov) => this.formatMovimiento(mov));
  }

  /**
   * Historial completo de un proveedor: todos los despachos de todas sus
   * canteras, con el vehículo, el conductor que manejó y la planificación.
   *
   * Incluye además el resumen por vehículo, que responde "qué vehículos
   * movieron material de este proveedor y cuánto llevó cada uno".
   */
  async getHistorialByProveedor(
    id: number,
    filtros?: { canteraId?: number; planningId?: number; desde?: string; hasta?: string },
  ) {
    const provider = await this.prisma.materialProvider.findUnique({
      where: { id },
      select: { id: true, ruc: true, razonsocial: true, nombreComercial: true },
    });
    if (!provider) {
      throw new NotFoundException('El proveedor de material no existe');
    }

    const where: Prisma.CanteraMaterialMovimientoWhereInput = {
      canteraMaterial: {
        cantera: {
          materialProviderId: id,
          ...(filtros?.canteraId && { id: filtros.canteraId }),
        },
      },
      ...(filtros?.planningId && { trip: { planningId: filtros.planningId } }),
    };

    if (filtros?.desde || filtros?.hasta) {
      where.capturedAt = {
        ...(filtros.desde && { gte: new Date(filtros.desde) }),
        ...(filtros.hasta && { lte: new Date(`${filtros.hasta.split('T')[0]}T23:59:59.999Z`) }),
      };
    }

    const movimientos = await this.prisma.canteraMaterialMovimiento.findMany({
      where,
      include: MaterialProvidersService.MOVIMIENTO_INCLUDE,
      orderBy: { capturedAt: 'desc' },
    });

    const formateados = movimientos.map((mov) => this.formatMovimiento(mov));

    // Resumen por vehículo, acumulando los conductores que lo manejaron
    const porVehiculo = new Map<number, any>();
    for (const mov of formateados) {
      const vehiculo = mov.trip?.vehicle;
      if (!vehiculo) continue;

      const acumulado = porVehiculo.get(vehiculo.id) ?? {
        vehicleId: vehiculo.id,
        vehicleid: vehiculo.vehicleid,
        plate: vehiculo.plate,
        marca: vehiculo.brand,
        modelo: vehiculo.model,
        tipo: vehiculo.type,
        empresa: vehiculo.company ?? vehiculo.owner?.companyname ?? null,
        viajes: 0,
        totalM3: 0,
        totalToneladas: 0,
        conductores: new Map<number, any>(),
      };

      acumulado.viajes += 1;
      acumulado.totalM3 += mov.m3 ?? 0;
      acumulado.totalToneladas += mov.toneladas ?? 0;

      if (mov.conductorViaje) {
        const previo = acumulado.conductores.get(mov.conductorViaje.id) ?? {
          ...mov.conductorViaje,
          viajes: 0,
          totalM3: 0,
        };
        previo.viajes += 1;
        previo.totalM3 += mov.m3 ?? 0;
        acumulado.conductores.set(mov.conductorViaje.id, previo);
      }

      porVehiculo.set(vehiculo.id, acumulado);
    }

    const vehiculos = Array.from(porVehiculo.values())
      .map((v) => ({
        ...v,
        conductores: Array.from(v.conductores.values()),
        // Más de un conductor en el historial = hubo relevo en este vehículo
        tuvoCambioDeConductor: v.conductores.size > 1,
      }))
      .sort((a, b) => b.totalM3 - a.totalM3);

    const totales = formateados.reduce(
      (acc, mov) => ({
        m3: acc.m3 + (mov.m3 ?? 0),
        toneladas: acc.toneladas + (mov.toneladas ?? 0),
        viajes: acc.viajes + 1,
      }),
      { m3: 0, toneladas: 0, viajes: 0 },
    );

    return { proveedor: provider, movimientos: formateados, vehiculos, totales };
  }
}
