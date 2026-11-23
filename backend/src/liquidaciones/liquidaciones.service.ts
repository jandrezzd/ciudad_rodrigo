import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import { siguienteCodigoLiquidacion } from '../common/codigo-secuencial';
import {
  flattenTrip,
  flattenTrips,
  TRIP_FULL_INCLUDE,
} from '../transport-log/flatten-trip';
import { limitesDia, whereRangoFechas } from '../transport-log/rango-fechas';
import { ListarViajesLiquidablesDto } from './dto/listar-viajes-liquidables.dto';
import { CrearLiquidacionDto } from './dto/crear-liquidacion.dto';
import { EditarLiquidacionDto } from './dto/editar-liquidacion.dto';
import { ListarLiquidacionesDto } from './dto/listar-liquidaciones.dto';

/** Estados de un viaje que nunca se liquidan. */
const ESTADOS_NO_LIQUIDABLES = ['CANCELADO', 'PENDIENTE_EMPAREJAMIENTO'];

/**
 * Viaje liquidable: emparejado (tiene llegada), no cancelado ni pendiente de
 * emparejar, y todavía en ninguna liquidación.
 */
export const WHERE_LIQUIDABLE: Prisma.TransportTripWhereInput = {
  arrivalAt: { not: null },
  status: { notIn: ESTADOS_NO_LIQUIDABLES as any },
  liquidacionViaje: { is: null },
};

/** Sin rango de fechas se devuelven como máximo estos viajes. */
const TOPE_SIN_RANGO = 500;

/** Hoy en Ecuador, AAAA-MM-DD. */
export function hoyEcuador(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Guayaquil',
  });
}

/** AAAA-MM-DD → Date para una columna @db.Date. */
const aFechaDb = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
/** Date de una columna @db.Date → AAAA-MM-DD. */
const deFechaDb = (fecha: Date) => fecha.toISOString().slice(0, 10);

/** Montos en centavos (enteros) para sumar y comparar sin errores de redondeo. */
const aCentavos = (valor: number | Prisma.Decimal) =>
  Math.round(Number(valor) * 100);
const deCentavos = (centavos: number) => centavos / 100;

/**
 * Subtotal de un viaje en centavos: m³ de llegada × precio unitario,
 * redondeado al centavo. El frontend usa la misma fórmula.
 */
export const subtotalCentavos = (
  m3: number | Prisma.Decimal,
  precio: number | Prisma.Decimal,
) => Math.round(Number(m3) * Number(precio) * 100);

/** m³ redondeados a 2 decimales (lo que guarda la columna Decimal(10,2)). */
const m3Redondeado = (m3: number) => Math.round(m3 * 100) / 100;

/** Datos de cada viaje que se muestran en el detalle de una liquidación. */
const VIAJE_DETALLE_SELECT = {
  id: true,
  codigo: true,
  departureAt: true,
  arrivalAt: true,
  notaLiquidador: true,
  vehicle: { select: { plate: true, vehicleid: true } },
  driver: { select: { name: true } },
  cantera: { select: { nombre: true } },
  material: { select: { materialType: true } },
  departure: { select: { m3: true, m3Corrected: true } },
  arrival: { select: { m3: true, m3Corrected: true } },
} satisfies Prisma.TransportTripSelect;

type ViajeConDetalle = {
  tripId: number;
  /** Precio unitario por m³. */
  precio: Prisma.Decimal | number;
  m3: Prisma.Decimal | number;
  subtotal: Prisma.Decimal | number;
  trip: Prisma.TransportTripGetPayload<{ select: typeof VIAJE_DETALLE_SELECT }>;
};

const m3Efectivo = (r?: { m3: number | null; m3Corrected: number | null } | null) =>
  r ? (r.m3Corrected ?? r.m3 ?? null) : null;

type ViajeMapeado = ReturnType<typeof mapearViaje>;

/** Viajes guardados en `viajesAnulados` (la foto tomada al anular). */
const viajesDeFoto = (foto: Prisma.JsonValue | null): ViajeMapeado[] =>
  Array.isArray(foto) ? (foto as unknown as ViajeMapeado[]) : [];

/** Fila de viaje del detalle; también es la foto que se guarda al anular. */
const mapearViaje = (v: ViajeConDetalle) => ({
  tripId: v.tripId,
  codigo: v.trip.codigo,
  placa: v.trip.vehicle?.plate ?? null,
  vehicleid: v.trip.vehicle?.vehicleid ?? null,
  conductor: v.trip.driver?.name ?? null,
  cantera: v.trip.cantera?.nombre ?? null,
  material: v.trip.material?.materialType ?? null,
  salida: v.trip.departureAt,
  llegada: v.trip.arrivalAt,
  m3Salida: m3Efectivo(v.trip.departure),
  m3Llegada: m3Efectivo(v.trip.arrival),
  notaLiquidador: v.trip.notaLiquidador ?? null,
  /** Precio unitario por m³. */
  precio: Number(v.precio),
  /** m³ de llegada con los que se calculó el subtotal. */
  m3: Number(v.m3),
  subtotal: Number(v.subtotal),
});

const DETALLE_INCLUDE = {
  constSite: {
    select: { id: true, name: true, province: true, canton: true },
  },
  client: {
    select: { id: true, name: true, companyname: true, ruc: true },
  },
  creadoPor: { select: { id: true, name: true } },
  editadoPor: { select: { id: true, name: true } },
  anuladaPor: { select: { id: true, name: true } },
  viajes: {
    orderBy: { trip: { departureAt: 'asc' } },
    include: { trip: { select: VIAJE_DETALLE_SELECT } },
  },
  ediciones: {
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true } } },
  },
} satisfies Prisma.LiquidacionInclude;

type LiquidacionConDetalle = Prisma.LiquidacionGetPayload<{
  include: typeof DETALLE_INCLUDE;
}>;

@Injectable()
export class LiquidacionesService {
  constructor(private prisma: PrismaService) {}

  // ─── Liquidaciones de viajes ──────────────────────────────────────────────

  async listarViajes(filtros: ListarViajesLiquidablesDto) {
    const rango = whereRangoFechas(filtros.desde, filtros.hasta);
    const rows = await this.prisma.transportTrip.findMany({
      where: {
        ...WHERE_LIQUIDABLE,
        ...(filtros.constSiteId && { constSiteId: filtros.constSiteId }),
        ...(filtros.clientId && { clientId: filtros.clientId }),
        ...(filtros.planningId && { planningId: filtros.planningId }),
        ...(rango && { AND: [rango] }),
      },
      include: TRIP_FULL_INCLUDE,
      orderBy: { departureAt: 'desc' },
      ...(!rango && { take: TOPE_SIN_RANGO }),
    });
    return flattenTrips(rows);
  }

  async obtenerViaje(id: number) {
    const trip = await this.prisma.transportTrip.findUnique({
      where: { id },
      include: {
        ...TRIP_FULL_INCLUDE,
        notaLiquidadorPor: { select: { id: true, name: true } },
        liquidacionViaje: {
          select: { liquidacion: { select: { id: true, codigo: true } } },
        },
      },
    });
    if (!trip) throw new NotFoundException('EL VIAJE NO EXISTE');

    const { liquidacionViaje, ...resto } = trip;
    return {
      ...flattenTrip(resto),
      liquidacion: liquidacionViaje?.liquidacion ?? null,
    };
  }

  /**
   * Nota del liquidador de un viaje (liquidado o no). Es un campo propio,
   * separado de `observation`, que el sistema usa para notas automáticas.
   */
  async guardarNotaViaje(id: number, nota: string | null, userId: number) {
    const existe = await this.prisma.transportTrip.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('EL VIAJE NO EXISTE');

    return this.prisma.transportTrip.update({
      where: { id },
      data: {
        notaLiquidador: nota,
        notaLiquidadorPorId: userId,
        notaLiquidadorEn: new Date(),
      },
      select: {
        id: true,
        notaLiquidador: true,
        notaLiquidadorEn: true,
        notaLiquidadorPor: { select: { id: true, name: true } },
      },
    });
  }

  // ─── Guardar ──────────────────────────────────────────────────────────────

  async crear(dto: CrearLiquidacionDto, userId: number) {
    const ids = dto.viajes.map((v) => v.tripId);
    this.validarSinRepetidos(ids);

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const trips = await tx.transportTrip.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            codigo: true,
            status: true,
            arrivalAt: true,
            constSiteId: true,
            clientId: true,
            arrival: { select: { m3: true, m3Corrected: true } },
            liquidacionViaje: {
              select: { liquidacion: { select: { codigo: true } } },
            },
          },
        });
        const porId = new Map(trips.map((t) => [t.id, t]));

        const errores: string[] = [];
        for (const tripId of ids) {
          const t = porId.get(tripId);
          if (!t) {
            errores.push(`viaje #${tripId} (no existe)`);
            continue;
          }
          const nombre = t.codigo ?? `viaje #${t.id}`;
          if (t.liquidacionViaje) {
            errores.push(
              `${nombre} (ya está en ${t.liquidacionViaje.liquidacion.codigo})`,
            );
          } else if (
            !t.arrivalAt ||
            ESTADOS_NO_LIQUIDABLES.includes(t.status as string)
          ) {
            errores.push(`${nombre} (no está emparejado o está cancelado)`);
          } else if (t.constSiteId !== dto.constSiteId) {
            errores.push(`${nombre} (es de otra obra)`);
          } else if (t.clientId !== dto.clientId) {
            errores.push(`${nombre} (es de otro cliente)`);
          } else if (!(m3Efectivo(t.arrival)! > 0)) {
            errores.push(`${nombre} (no tiene m³ de llegada)`);
          }
        }
        if (errores.length > 0) {
          throw new BusinessException(
            'LIQUIDACION_INVALIDA',
            `NO SE PUEDE LIQUIDAR: ${errores.join(', ')}`,
            false,
            400,
          );
        }

        // Precio unitario × m³ de llegada (corregidos si los hay).
        const filas = dto.viajes.map((v) => {
          const m3 = m3Redondeado(m3Efectivo(porId.get(v.tripId)!.arrival)!);
          const precio = deCentavos(aCentavos(v.precio));
          return {
            tripId: v.tripId,
            precio,
            m3,
            subtotal: deCentavos(subtotalCentavos(m3, precio)),
          };
        });
        const totalCentavos = filas.reduce(
          (suma, f) => suma + aCentavos(f.subtotal),
          0,
        );
        const codigo = await siguienteCodigoLiquidacion(tx, new Date());

        const creada = await tx.liquidacion.create({
          data: {
            codigo,
            constSiteId: dto.constSiteId,
            clientId: dto.clientId,
            fecha: aFechaDb(dto.fecha ?? hoyEcuador()),
            montoTotal: deCentavos(totalCentavos),
            observacion: dto.observacion?.trim() || null,
            creadoPorId: userId,
            viajes: { create: filas },
          },
          select: { id: true },
        });
        return creada.id;
      });

      return this.detalle(id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BusinessException(
          'VIAJE_YA_LIQUIDADO',
          'ALGÚN VIAJE YA FUE LIQUIDADO POR OTRO USUARIO. RECARGUE LA LISTA.',
          true,
          409,
        );
      }
      throw error;
    }
  }

  // ─── Historial ────────────────────────────────────────────────────────────

  async listar(filtros: ListarLiquidacionesDto) {
    const fecha = limitesDia(filtros.desde, filtros.hasta);
    const codigo = filtros.codigo?.trim();

    const rows = await this.prisma.liquidacion.findMany({
      where: {
        ...(fecha && {
          fecha: {
            ...(filtros.desde && { gte: aFechaDb(filtros.desde) }),
            ...(filtros.hasta && { lte: aFechaDb(filtros.hasta) }),
          },
        }),
        ...(filtros.constSiteId && { constSiteId: filtros.constSiteId }),
        ...(filtros.clientId && { clientId: filtros.clientId }),
        ...(filtros.estado && { estado: filtros.estado }),
        ...(codigo && { codigo: { contains: codigo, mode: 'insensitive' } }),
      },
      include: {
        constSite: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, companyname: true } },
        _count: { select: { viajes: true } },
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });

    return rows.map((l) => ({
      id: l.id,
      codigo: l.codigo,
      obra: l.constSite,
      cliente: l.client,
      montoTotal: Number(l.montoTotal),
      fecha: deFechaDb(l.fecha),
      // Una anulada ya no tiene filas de viajes: se cuentan los de su foto.
      cantidadViajes:
        l.estado === 'ANULADA'
          ? viajesDeFoto(l.viajesAnulados).length
          : l._count.viajes,
      estado: l.estado,
      editadoEn: l.editadoEn,
      anuladaEn: l.anuladaEn,
    }));
  }

  async detalle(id: number) {
    const liquidacion = await this.prisma.liquidacion.findUnique({
      where: { id },
      include: DETALLE_INCLUDE,
    });
    if (!liquidacion) throw new NotFoundException('LA LIQUIDACIÓN NO EXISTE');
    return this.formatearDetalle(liquidacion);
  }

  // ─── Editar ───────────────────────────────────────────────────────────────

  async editar(id: number, dto: EditarLiquidacionDto, userId: number) {
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.liquidacion.findUnique({
        where: { id },
        include: {
          viajes: {
            include: { trip: { select: { codigo: true } } },
          },
        },
      });
      if (!actual) throw new NotFoundException('LA LIQUIDACIÓN NO EXISTE');
      this.asegurarActiva(actual);

      const cambios: Record<string, unknown> = {};
      const quitados: typeof actual.viajes = [];
      const preciosCambiados: {
        viaje: (typeof actual.viajes)[number];
        nuevoCentavos: number;
      }[] = [];

      if (dto.viajes) {
        const ids = dto.viajes.map((v) => v.tripId);
        this.validarSinRepetidos(ids);

        const actualesPorTrip = new Map(actual.viajes.map((v) => [v.tripId, v]));
        const nuevos = ids.filter((tripId) => !actualesPorTrip.has(tripId));
        if (nuevos.length > 0) {
          throw new BusinessException(
            'VALIDATION_ERROR',
            'NO SE PUEDEN AGREGAR VIAJES AL EDITAR UNA LIQUIDACIÓN',
            false,
            400,
          );
        }

        const enviados = new Map(dto.viajes.map((v) => [v.tripId, v.precio]));
        for (const viaje of actual.viajes) {
          const precio = enviados.get(viaje.tripId);
          if (precio === undefined) {
            quitados.push(viaje);
          } else if (aCentavos(precio) !== aCentavos(viaje.precio)) {
            preciosCambiados.push({ viaje, nuevoCentavos: aCentavos(precio) });
          }
        }
        // El DTO ya exige al menos un viaje, pero la regla vive aquí también.
        if (quitados.length === actual.viajes.length) {
          throw new BusinessException(
            'VALIDATION_ERROR',
            'UNA LIQUIDACIÓN DEBE TENER AL MENOS UN VIAJE',
            false,
            400,
          );
        }

        // antes/despues son precios unitarios; también va el subtotal.
        if (preciosCambiados.length > 0) {
          cambios.precios = preciosCambiados.map(({ viaje, nuevoCentavos }) => ({
            tripId: viaje.tripId,
            codigo: viaje.trip.codigo,
            m3: Number(viaje.m3),
            antes: Number(viaje.precio),
            despues: deCentavos(nuevoCentavos),
            subtotalAntes: Number(viaje.subtotal),
            subtotalDespues: deCentavos(
              subtotalCentavos(viaje.m3, deCentavos(nuevoCentavos)),
            ),
          }));
        }
        if (quitados.length > 0) {
          cambios.quitados = quitados.map((v) => ({
            tripId: v.tripId,
            codigo: v.trip.codigo,
            m3: Number(v.m3),
            precio: Number(v.precio),
            subtotal: Number(v.subtotal),
          }));
        }
      }

      const fechaAntes = deFechaDb(actual.fecha);
      if (dto.fecha !== undefined && dto.fecha !== fechaAntes) {
        cambios.fecha = { antes: fechaAntes, despues: dto.fecha };
      }

      const observacionNueva =
        dto.observacion === undefined
          ? undefined
          : dto.observacion?.trim() || null;
      if (
        observacionNueva !== undefined &&
        observacionNueva !== actual.observacion
      ) {
        cambios.observacion = {
          antes: actual.observacion,
          despues: observacionNueva,
        };
      }

      if (Object.keys(cambios).length === 0) {
        throw new BusinessException(
          'SIN_CAMBIOS',
          'NO HAY CAMBIOS PARA GUARDAR',
          false,
          400,
        );
      }

      if (quitados.length > 0) {
        await tx.liquidacionViaje.deleteMany({
          where: { id: { in: quitados.map((v) => v.id) } },
        });
      }
      // El subtotal se recalcula con los m³ guardados en la fila.
      const nuevosSubtotales = new Map<number, number>();
      for (const { viaje, nuevoCentavos } of preciosCambiados) {
        const subtotal = subtotalCentavos(viaje.m3, deCentavos(nuevoCentavos));
        nuevosSubtotales.set(viaje.id, subtotal);
        await tx.liquidacionViaje.update({
          where: { id: viaje.id },
          data: {
            precio: deCentavos(nuevoCentavos),
            subtotal: deCentavos(subtotal),
          },
        });
      }

      const idsQuitados = new Set(quitados.map((v) => v.id));
      const totalCentavos = actual.viajes
        .filter((v) => !idsQuitados.has(v.id))
        .reduce(
          (suma, v) =>
            suma + (nuevosSubtotales.get(v.id) ?? aCentavos(v.subtotal)),
          0,
        );
      const totalAntes = Number(actual.montoTotal);
      const totalDespues = deCentavos(totalCentavos);
      if (aCentavos(totalAntes) !== totalCentavos) {
        cambios.montoTotal = { antes: totalAntes, despues: totalDespues };
      }

      await tx.liquidacion.update({
        where: { id },
        data: {
          montoTotal: totalDespues,
          ...(cambios.fecha !== undefined && { fecha: aFechaDb(dto.fecha!) }),
          ...(cambios.observacion !== undefined && {
            observacion: observacionNueva,
          }),
          editadoPorId: userId,
          editadoEn: new Date(),
        },
      });

      await tx.liquidacionEdicion.create({
        data: {
          liquidacionId: id,
          userId,
          motivo: dto.motivo,
          cambios: cambios as Prisma.InputJsonValue,
        },
      });
    });

    return this.detalle(id);
  }

  // ─── Anular ───────────────────────────────────────────────────────────────

  /**
   * Anula la liquidación: queda en el historial como ANULADA, con quién,
   * cuándo y el motivo; guarda la foto de sus viajes (con precio) y borra sus
   * filas de LiquidacionViaje, así esos viajes vuelven a ser liquidables.
   */
  async anular(id: number, motivo: string, userId: number) {
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.liquidacion.findUnique({
        where: { id },
        include: {
          viajes: {
            orderBy: { trip: { departureAt: 'asc' } },
            include: { trip: { select: VIAJE_DETALLE_SELECT } },
          },
        },
      });
      if (!actual) throw new NotFoundException('LA LIQUIDACIÓN NO EXISTE');
      this.asegurarActiva(actual);

      const foto = actual.viajes.map(mapearViaje);
      const ahora = new Date();

      await tx.liquidacionViaje.deleteMany({ where: { liquidacionId: id } });
      await tx.liquidacion.update({
        where: { id },
        data: {
          estado: 'ANULADA',
          anuladaPorId: userId,
          anuladaEn: ahora,
          motivoAnulacion: motivo,
          viajesAnulados: JSON.parse(JSON.stringify(foto)) as Prisma.InputJsonValue,
        },
      });
      // También en el historial de ediciones, para verlo junto a las demás.
      await tx.liquidacionEdicion.create({
        data: {
          liquidacionId: id,
          userId,
          motivo,
          cambios: {
            anulada: {
              viajes: foto.length,
              montoTotal: Number(actual.montoTotal),
            },
          },
        },
      });
    });

    return this.detalle(id);
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

  private asegurarActiva(l: { estado: string; codigo: string }) {
    if (l.estado === 'ANULADA') {
      throw new BusinessException(
        'LIQUIDACION_ANULADA',
        `LA LIQUIDACIÓN ${l.codigo} ESTÁ ANULADA Y YA NO SE PUEDE MODIFICAR`,
        false,
        400,
      );
    }
  }

  private validarSinRepetidos(ids: number[]) {
    if (new Set(ids).size !== ids.length) {
      throw new BusinessException(
        'VALIDATION_ERROR',
        'HAY VIAJES REPETIDOS EN LA LISTA',
        false,
        400,
      );
    }
  }

  private formatearDetalle(l: LiquidacionConDetalle) {
    const anulada = l.estado === 'ANULADA';
    return {
      id: l.id,
      codigo: l.codigo,
      fecha: deFechaDb(l.fecha),
      montoTotal: Number(l.montoTotal),
      observacion: l.observacion,
      estado: l.estado,
      obra: l.constSite,
      cliente: l.client,
      creadoPor: l.creadoPor,
      createdAt: l.createdAt,
      editadoPor: l.editadoPor,
      editadoEn: l.editadoEn,
      anuladaPor: l.anuladaPor,
      anuladaEn: l.anuladaEn,
      motivoAnulacion: l.motivoAnulacion,
      // Anulada: los viajes como estaban al anularla (sus filas ya no existen).
      viajes: anulada ? viajesDeFoto(l.viajesAnulados) : l.viajes.map(mapearViaje),
      ediciones: l.ediciones.map((e) => ({
        id: e.id,
        usuario: e.user,
        fecha: e.createdAt,
        motivo: e.motivo,
        cambios: e.cambios,
      })),
    };
  }
}
