/**
 * Registra los choferes de CONSORCIO J&H (prisma/data/vehiculos-jh.json) como
 * choferes EXTERNOS de ese proveedor, SIN asignarlos a ningún vehículo.
 *
 * Las placas de la tabla son vehículos de Ciudad Rodrigo: no cambian de
 * chofer, tipo ni proveedor. Solo se completa su capacidad cuando está en 0.
 * Tampoco modifica choferes existentes: si ya hay uno con la misma
 * cédula o el mismo nombre, solo lo informa. El proveedor debe existir (se
 * busca por nombre y tiene que haber uno solo); este script nunca lo crea.
 *
 * Por defecto solo MUESTRA lo que haría, sin guardar nada:
 *   npx ts-node prisma/importar-jh.ts
 * Para guardar de verdad:
 *   npx ts-node prisma/importar-jh.ts --aplicar
 *
 * Se puede correr varias veces: nunca duplica.
 */
import { DriverTipo, Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export interface DatosJH {
  proveedor: { buscar: string; nombre: string; representante: string };
  choferes: { nombre: string; cedula: string; placa: string; m3: number }[];
}

const APLICAR = process.argv.includes('--aplicar');

export async function importarJH(
  tx: Prisma.TransactionClient,
  datos: DatosJH,
  nota: (linea: string) => void,
) {
  const resumen = {
    proveedor: '',
    creados: [] as string[],
    yaExistian: [] as string[],
    capacidad: [] as string[],
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

  // 2. Choferes: se crean solo si no existe ninguno con esa cédula o ese nombre.
  for (const c of datos.choferes) {
    const nombre = c.nombre.trim().toUpperCase();
    const existente = await tx.driver.findFirst({
      where: {
        OR: [{ document: c.cedula }, { name: { equals: nombre, mode: 'insensitive' } }],
      },
      select: { id: true, name: true, document: true, tipo: true, ownerId: true },
    });
    if (existente) {
      resumen.yaExistian.push(nombre);
      nota(
        `ℹ️  ${nombre} ya existe (id ${existente.id}, ${existente.tipo}, cédula ${existente.document ?? '—'}, proveedor ${existente.ownerId ?? 'ninguno'}): no se crea ni se modifica.`,
      );
      continue;
    }
    const creado = await tx.driver.create({
      data: {
        name: nombre,
        document: c.cedula,
        tipo: DriverTipo.EXTERNO,
        ownerId: proveedor.id,
      },
    });
    resumen.creados.push(nombre);
    nota(`✅ ${nombre} (${c.cedula}) registrado como externo de J&H (id ${creado.id}), sin vehículo.`);
  }

  // 3. Capacidad: solo en los vehículos que la tienen en 0.
  const capacidades = new Map(datos.choferes.map((c) => [c.placa, c.m3]));
  for (const [placa, m3] of capacidades) {
    const vehiculo = await tx.vehicle.findUnique({
      where: { plate: placa },
      select: { id: true, vehicleid: true, capacity: true },
    });
    if (!vehiculo) {
      nota(`⚠️  ${placa} no está registrado: no se crea.`);
    } else if (vehiculo.capacity) {
      nota(`ℹ️  ${placa} ya tiene ${vehiculo.capacity} m³: se deja como está.`);
    } else {
      await tx.vehicle.update({ where: { id: vehiculo.id }, data: { capacity: m3 } });
      resumen.capacidad.push(`${placa} (${vehiculo.vehicleid})`);
      nota(`✅ ${placa} (${vehiculo.vehicleid}): capacidad 0 → ${m3} m³.`);
    }
  }

  return resumen;
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
  let resumen: Awaited<ReturnType<typeof importarJH>> | null = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        resumen = await importarJH(tx, datos, (l) => log.push(l));
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

  const r = resumen!;
  log.forEach((l) => console.log(l));
  console.log('\n──── Resumen ────');
  console.log(`Proveedor: ${r.proveedor}`);
  console.log(`Choferes registrados (${r.creados.length}): ${r.creados.join(', ') || 'ninguno'}`);
  console.log(`Ya existían, sin cambios (${r.yaExistian.length}): ${r.yaExistian.join(', ') || 'ninguno'}`);
  console.log(
    `Capacidad completada (${r.capacidad.length}): ${r.capacidad.join(', ') || 'ninguna'}`,
  );
  console.log('Choferes de los vehículos: no se cambia ninguno.');
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
