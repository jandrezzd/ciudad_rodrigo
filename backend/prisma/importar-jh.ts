/**
 * Registra los choferes de CONSORCIO J&H y los asigna a sus vehículos
 * (prisma/data/vehiculos-jh.json).
 *
 * Las placas ya existen como vehículos INTERNOS de Ciudad Rodrigo y se quedan
 * así: no cambian de tipo ni de proveedor. Solo se completa la capacidad
 * cuando está en 0 y se asigna el chofer. El proveedor debe existir (se busca
 * por nombre y tiene que haber uno solo); este script nunca lo crea.
 *
 * Por defecto solo MUESTRA lo que haría, sin guardar nada:
 *   npx ts-node prisma/importar-jh.ts
 * Para guardar de verdad:
 *   npx ts-node prisma/importar-jh.ts --aplicar
 *
 * Se puede correr varias veces: lo que ya existe (chofer por cédula, chofer
 * asignado al vehículo) se respeta y nunca se duplica.
 */
import { DriverTipo, Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export interface DatosJH {
  proveedor: { buscar: string; nombre: string; representante: string };
  vehiculos: { placa: string; m3: number; choferes: [string, string][] }[];
}

const APLICAR = process.argv.includes('--aplicar');

export async function importarJH(
  tx: Prisma.TransactionClient,
  datos: DatosJH,
  nota: (linea: string) => void,
) {
  const resumen = {
    proveedor: '',
    capacidadCompletada: 0,
    vehiculosNoEncontrados: [] as string[],
    choferesCreados: 0,
    choferesExistentes: 0,
    asignados: 0,
    sinChofer: [] as string[],
  };

  // 1. Proveedor: tiene que existir uno solo con ese nombre.
  const candidatos = await tx.owner.findMany({
    where: {
      OR: [
        { companyname: { contains: datos.proveedor.buscar, mode: 'insensitive' } },
        { name: { contains: datos.proveedor.buscar, mode: 'insensitive' } },
      ],
    },
    select: { id: true, ruc: true, companyname: true, name: true },
  });
  if (candidatos.length !== 1) {
    const lista = candidatos
      .map((o) => `id ${o.id} · ${o.ruc} · ${o.companyname ?? o.name}`)
      .join('\n  ');
    throw new Error(
      candidatos.length === 0
        ? `No existe un proveedor con "${datos.proveedor.buscar}" en el nombre. Regístralo primero desde la web.`
        : `Hay ${candidatos.length} proveedores con "${datos.proveedor.buscar}" en el nombre; no se sabe cuál usar:\n  ${lista}`,
    );
  }
  const proveedor = candidatos[0];
  resumen.proveedor = `id ${proveedor.id} · RUC ${proveedor.ruc} · ${proveedor.companyname ?? proveedor.name}`;

  // 2. Choferes por cédula.
  const choferes = new Map<
    string,
    { id: number; vehiculoId: number | null; name: string }
  >();
  for (const v of datos.vehiculos) {
    for (const [nombre, cedula] of v.choferes) {
      if (choferes.has(cedula)) continue;
      const existente = await tx.driver.findUnique({
        where: { document: cedula },
        include: { vehicle: { select: { id: true, plate: true } } },
      });
      if (existente) {
        resumen.choferesExistentes++;
        if (existente.tipo === DriverTipo.INTERNO) {
          nota(`⚠️  Chofer ${nombre} (${cedula}) ya existe como INTERNO: no se modifica.`);
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
        choferes.set(cedula, {
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
        choferes.set(cedula, { id: creado.id, vehiculoId: null, name: nombre });
      }
    }
  }

  // 3. Vehículos existentes: capacidad (solo si está en 0) y chofer.
  for (const v of datos.vehiculos) {
    const vehiculo = await tx.vehicle.findUnique({ where: { plate: v.placa } });
    if (!vehiculo) {
      resumen.vehiculosNoEncontrados.push(v.placa);
      nota(`⚠️  ${v.placa} no está registrado: no se crea. Revisa la placa.`);
      continue;
    }
    if (!vehiculo.capacity) {
      await tx.vehicle.update({
        where: { id: vehiculo.id },
        data: { capacity: v.m3 },
      });
      resumen.capacidadCompletada++;
      nota(`ℹ️  ${v.placa} (${vehiculo.vehicleid}): capacidad 0 → ${v.m3} m³.`);
    } else if (vehiculo.capacity !== v.m3) {
      nota(
        `ℹ️  ${v.placa} ya tiene ${vehiculo.capacity} m³ (la tabla dice ${v.m3}): se deja el registrado.`,
      );
    }

    if (vehiculo.driverId) {
      nota(`ℹ️  ${v.placa} ya tiene chofer asignado: se respeta.`);
      continue;
    }
    const libre = v.choferes
      .map(([, cedula]) => choferes.get(cedula)!)
      .find((c) => c.vehiculoId == null);
    if (!libre) {
      resumen.sinChofer.push(v.placa);
      continue;
    }
    await tx.vehicle.update({
      where: { id: vehiculo.id },
      data: { driverId: libre.id },
    });
    libre.vehiculoId = vehiculo.id;
    resumen.asignados++;
    nota(`✅ ${v.placa} (${vehiculo.vehicleid}, ${vehiculo.type}) → ${libre.name}`);
  }

  const sinVehiculo = [...choferes.values()].filter((c) => c.vehiculoId == null);
  return { resumen, sinVehiculo };
}

async function main() {
  const prisma = new PrismaClient();
  const log: string[] = [];
  const datos: DatosJH = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'vehiculos-jh.json'), 'utf8'),
  );

  const db = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  console.log(
    `Base: ${db[0].db} · Modo: ${APLICAR ? 'APLICAR (guarda)' : 'SIMULACIÓN (no guarda nada)'}\n`,
  );

  const SIMULACION = new Error('simulacion');
  let resultado: Awaited<ReturnType<typeof importarJH>> | null = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        resultado = await importarJH(tx, datos, (l) => log.push(l));
        // En simulación todo se deshace al final.
        if (!APLICAR) throw SIMULACION;
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    if (error !== SIMULACION) throw error;
  } finally {
    await prisma.$disconnect();
  }

  const { resumen, sinVehiculo } = resultado!;
  log.forEach((l) => console.log(l));
  console.log('\n──── Resumen ────');
  console.log(`Proveedor: ${resumen.proveedor}`);
  console.log(`Capacidad completada: ${resumen.capacidadCompletada} vehículo(s)`);
  console.log(
    `Placas no registradas: ${resumen.vehiculosNoEncontrados.join(', ') || 'ninguna'}`,
  );
  console.log(
    `Choferes: ${resumen.choferesCreados} creados, ${resumen.choferesExistentes} ya existían`,
  );
  console.log(`Vehículos con chofer asignado ahora: ${resumen.asignados}`);
  console.log(`Vehículos sin chofer disponible: ${resumen.sinChofer.join(', ') || 'ninguno'}`);
  console.log(
    `Choferes registrados sin vehículo fijo (${sinVehiculo.length}): ${sinVehiculo.map((c) => c.name).join(', ') || 'ninguno'}`,
  );
  console.log(
    APLICAR
      ? '\n✅ Guardado.'
      : '\nNada se guardó. Para guardar: npx ts-node prisma/importar-jh.ts --aplicar',
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌', e.message ?? e);
    process.exitCode = 1;
  });
}
