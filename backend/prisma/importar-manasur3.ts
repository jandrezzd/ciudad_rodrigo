/**
 * Carga los vehículos externos y choferes de CONSORCIO MANASUR 3
 * (prisma/data/vehiculos-manasur3.json).
 *
 * Por defecto solo MUESTRA lo que haría, sin guardar nada:
 *   npx ts-node prisma/importar-manasur3.ts
 * Para guardar de verdad:
 *   npx ts-node prisma/importar-manasur3.ts --aplicar
 *
 * Se puede correr varias veces: lo que ya existe (proveedor por RUC, vehículo
 * por placa, chofer por cédula) se reutiliza y nunca se duplica.
 */
import { DriverTipo, Prisma, PrismaClient, VehicleType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { siguienteIdVehiculoExterno } from '../src/vehicles/id-vehiculo-externo';

interface Datos {
  proveedor: { ruc: string; companyname: string; name: string };
  /** Cédula null: chofer registrado sin cédula (datos en conflicto), se busca por nombre. */
  vehiculos: {
    placa: string;
    m3: number;
    choferes: [string, string | null][];
  }[];
}

/** Clave del chofer: su cédula, o su nombre si se registra sin cédula. */
const claveChofer = (nombre: string, cedula: string | null) =>
  cedula ?? `NOMBRE:${nombre.trim().toUpperCase()}`;

const APLICAR = process.argv.includes('--aplicar');
const prisma = new PrismaClient();
const log: string[] = [];
const nota = (linea: string) => log.push(linea);

async function verificarEsquema() {
  // Marca, modelo y año opcionales llegan con esta migración: sin ella el
  // vehículo no se puede crear solo con placa y cubicaje.
  const filas = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "_prisma_migrations"
    WHERE migration_name = '20261004120000_add_orden_vehiculos'
      AND finished_at IS NOT NULL`;
  if (Number(filas[0]?.n ?? 0) === 0) {
    throw new Error(
      'Falta aplicar la migración 20261004120000_add_orden_vehiculos. ' +
        'Corre primero: git pull && npx prisma migrate deploy && npx prisma generate',
    );
  }
}

async function importar(tx: Prisma.TransactionClient, datos: Datos) {
  const resumen = {
    proveedor: '',
    vehiculosCreados: 0,
    vehiculosExistentes: 0,
    choferesCreados: 0,
    choferesExistentes: 0,
    asignados: 0,
    sinChofer: [] as string[],
  };

  // 1. Proveedor por RUC.
  let proveedor = await tx.owner.findUnique({
    where: { ruc: datos.proveedor.ruc },
  });
  if (proveedor) {
    resumen.proveedor = `existente (id ${proveedor.id})`;
    if (!proveedor.name) {
      proveedor = await tx.owner.update({
        where: { id: proveedor.id },
        data: { name: datos.proveedor.name },
      });
    }
  } else {
    proveedor = await tx.owner.create({ data: datos.proveedor });
    resumen.proveedor = `creado (id ${proveedor.id})`;
  }

  // 2. Choferes por cédula (un mismo chofer aparece en varias filas). Los que
  //    van sin cédula se buscan por nombre dentro de este proveedor.
  const choferes = new Map<
    string,
    { id: number; vehiculoId: number | null; name: string }
  >();
  for (const v of datos.vehiculos) {
    for (const [nombre, cedula] of v.choferes) {
      const clave = claveChofer(nombre, cedula);
      if (choferes.has(clave)) continue;
      const existente = cedula
        ? await tx.driver.findUnique({
            where: { document: cedula },
            include: { vehicle: { select: { id: true, plate: true } } },
          })
        : await tx.driver.findFirst({
            where: {
              ownerId: proveedor.id,
              name: { equals: nombre.trim(), mode: 'insensitive' },
            },
            include: { vehicle: { select: { id: true, plate: true } } },
          });
      if (existente && !cedula && existente.document) {
        // Su cédula estaba en conflicto con la de otro chofer: se deja vacía.
        await tx.driver.update({
          where: { id: existente.id },
          data: { document: null },
        });
        nota(
          `ℹ️  Chofer ${nombre}: se quitó la cédula ${existente.document} (en conflicto).`,
        );
      }
      if (existente) {
        resumen.choferesExistentes++;
        if (existente.tipo === DriverTipo.INTERNO) {
          nota(
            `⚠️  Chofer ${nombre} (${cedula}) ya existe como INTERNO: no se modifica.`,
          );
        } else if (existente.ownerId && existente.ownerId !== proveedor.id) {
          nota(
            `⚠️  Chofer ${nombre} (${cedula}) ya es de otro proveedor (id ${existente.ownerId}): no se modifica.`,
          );
        } else if (!existente.ownerId) {
          await tx.driver.update({
            where: { id: existente.id },
            data: { ownerId: proveedor.id },
          });
        }
        choferes.set(clave, {
          id: existente.id,
          vehiculoId: existente.vehicle?.id ?? null,
          name: existente.name,
        });
      } else {
        const creado = await tx.driver.create({
          data: {
            name: nombre,
            document: cedula,
            tipo: DriverTipo.EXTERNO,
            ownerId: proveedor.id,
          },
        });
        resumen.choferesCreados++;
        choferes.set(clave, { id: creado.id, vehiculoId: null, name: nombre });
      }
    }
  }

  // 3. Vehículos por placa, con el primer chofer disponible de su lista.
  for (const v of datos.vehiculos) {
    const existente = await tx.vehicle.findUnique({
      where: { plate: v.placa },
    });
    let vehiculo = existente;
    if (existente) {
      resumen.vehiculosExistentes++;
      if (existente.ownerId !== proveedor.id) {
        nota(
          `⚠️  ${v.placa} ya existe (${existente.vehicleid}, ${existente.type}, proveedor ${existente.ownerId ?? 'ninguno'}): no se cambia su proveedor.`,
        );
      }
      if (existente.capacity !== v.m3) {
        nota(
          `ℹ️  ${v.placa} ya existe con ${existente.capacity} m³ (la tabla dice ${v.m3}): se deja el registrado.`,
        );
      }
    } else {
      vehiculo = await tx.vehicle.create({
        data: {
          vehicleid: await siguienteIdVehiculoExterno(tx),
          plate: v.placa,
          capacity: v.m3,
          type: VehicleType.EXTERNO,
          ownerId: proveedor.id,
        },
      });
      resumen.vehiculosCreados++;
    }

    if (vehiculo!.driverId) {
      nota(`ℹ️  ${v.placa} ya tiene chofer asignado: se respeta.`);
      continue;
    }
    const libre = v.choferes
      .map(([nombre, cedula]) => choferes.get(claveChofer(nombre, cedula))!)
      .find((c) => c.vehiculoId == null);
    if (!libre) {
      resumen.sinChofer.push(v.placa);
      continue;
    }
    await tx.vehicle.update({
      where: { id: vehiculo!.id },
      data: { driverId: libre.id },
    });
    libre.vehiculoId = vehiculo!.id;
    resumen.asignados++;
    nota(`✅ ${v.placa} (${vehiculo!.vehicleid}, ${v.m3} m³) → ${libre.name}`);
  }

  const sinVehiculo = [...choferes.values()].filter(
    (c) => c.vehiculoId == null,
  );
  return { resumen, sinVehiculo };
}

async function main() {
  const datos: Datos = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'data', 'vehiculos-manasur3.json'),
      'utf8',
    ),
  );
  await verificarEsquema();

  const db = await prisma.$queryRaw<
    { db: string }[]
  >`SELECT current_database() AS db`;
  console.log(
    `Base: ${db[0].db} · Modo: ${APLICAR ? 'APLICAR (guarda)' : 'SIMULACIÓN (no guarda nada)'}\n`,
  );

  const SIMULACION = new Error('simulacion');
  let resultado: Awaited<ReturnType<typeof importar>> | null = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        resultado = await importar(tx, datos);
        // En simulación todo se deshace al final.
        if (!APLICAR) throw SIMULACION;
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    if (error !== SIMULACION) throw error;
  }

  const { resumen, sinVehiculo } = resultado!;
  log.forEach((l) => console.log(l));
  console.log('\n──── Resumen ────');
  console.log(`Proveedor CONSORCIO MANASUR 3: ${resumen.proveedor}`);
  console.log(
    `Vehículos: ${resumen.vehiculosCreados} creados, ${resumen.vehiculosExistentes} ya existían`,
  );
  console.log(
    `Choferes: ${resumen.choferesCreados} creados, ${resumen.choferesExistentes} ya existían`,
  );
  console.log(`Vehículos con chofer asignado ahora: ${resumen.asignados}`);
  console.log(
    `Vehículos sin chofer disponible: ${resumen.sinChofer.join(', ') || 'ninguno'}`,
  );
  console.log(
    `Choferes registrados sin vehículo fijo (${sinVehiculo.length}): ${sinVehiculo.map((c) => c.name).join(', ') || 'ninguno'}`,
  );
  console.log(
    APLICAR
      ? '\n✅ Guardado.'
      : '\nNada se guardó. Para guardar: npx ts-node prisma/importar-manasur3.ts --aplicar',
  );
}

main()
  .catch((e) => {
    console.error('❌', e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
