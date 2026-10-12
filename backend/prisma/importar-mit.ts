/**
 * Carga el cliente público MINISTERIO DE INFRAESTRUCTURA Y TRANSPORTE, su obra,
 * su proveedor de vehículos (mismo RUC) y sus volquetas externas
 * (prisma/data/vehiculos-mit.json).
 *
 * Por defecto solo MUESTRA lo que haría, sin guardar nada:
 *   npx ts-node prisma/importar-mit.ts
 * Para guardar de verdad:
 *   npx ts-node prisma/importar-mit.ts --aplicar
 *
 * Se puede correr varias veces: lo que ya existe (cliente y proveedor por RUC,
 * obra por nombre, vehículo por placa) se reutiliza y nunca se duplica.
 */
import { ClientType, Prisma, PrismaClient, VehicleType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { siguienteIdVehiculoExterno } from '../src/vehicles/id-vehiculo-externo';
import { asegurarProveedorPorRuc } from '../src/owners/proveedor-por-ruc';
import {
  buscarObraPorNombre,
  vincularClienteObra,
} from '../src/const-sites/obra-por-nombre';

interface Datos {
  cliente: {
    ruc: string;
    companyname: string;
    name: string;
    type: ClientType;
    province?: string;
    canton?: string;
  };
  obra: { name: string; province?: string; canton?: string; address?: string };
  vehiculos: { placa: string; m3: number }[];
}

const APLICAR = process.argv.includes('--aplicar');
const prisma = new PrismaClient();
const log: string[] = [];
const nota = (linea: string) => log.push(linea);

async function importar(tx: Prisma.TransactionClient, datos: Datos) {
  const resumen = {
    cliente: '',
    obra: '',
    proveedor: '',
    vehiculosCreados: 0,
    vehiculosExistentes: 0,
  };

  // 1. Cliente público por RUC.
  let cliente = await tx.client.findUnique({
    where: { ruc: datos.cliente.ruc },
  });
  if (cliente) {
    resumen.cliente = `existente (id ${cliente.id}, ${cliente.type})`;
    if (cliente.type !== ClientType.PUBLICO) {
      nota(
        `⚠️  El cliente con RUC ${cliente.ruc} ya existe como ${cliente.type}: no se cambia su tipo.`,
      );
    }
  } else {
    cliente = await tx.client.create({ data: datos.cliente });
    resumen.cliente = `creado (id ${cliente.id})`;
  }

  // 2. Obra por nombre, vinculada al cliente.
  let obra = await buscarObraPorNombre(tx, datos.obra.name);
  if (obra) {
    resumen.obra = `existente (id ${obra.id})`;
  } else {
    obra = await tx.constSite.create({
      data: { ...datos.obra, name: datos.obra.name.trim() },
    });
    resumen.obra = `creada (id ${obra.id})`;
  }
  await vincularClienteObra(tx, cliente.id, obra.id);

  // 3. Proveedor de vehículos con el mismo RUC (igual que al crear un
  //    cliente público desde la web).
  const proveedorPrevio = await tx.owner.findUnique({
    where: { ruc: datos.cliente.ruc },
  });
  const proveedor = await asegurarProveedorPorRuc(
    tx,
    datos.cliente.ruc,
    datos.cliente.companyname,
  );
  resumen.proveedor = proveedorPrevio
    ? `existente (id ${proveedor.id})`
    : `creado (id ${proveedor.id})`;

  // 4. Vehículos externos por placa, con ID TE- autoincrementable.
  for (const v of datos.vehiculos) {
    const existente = await tx.vehicle.findUnique({
      where: { plate: v.placa },
    });
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
      continue;
    }
    const creado = await tx.vehicle.create({
      data: {
        vehicleid: await siguienteIdVehiculoExterno(tx),
        plate: v.placa,
        capacity: v.m3,
        type: VehicleType.EXTERNO,
        ownerId: proveedor.id,
      },
    });
    resumen.vehiculosCreados++;
    nota(`✅ ${v.placa} → ${creado.vehicleid} (${v.m3} m³)`);
  }

  return resumen;
}

async function main() {
  const datos: Datos = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'vehiculos-mit.json'), 'utf8'),
  );

  const db = await prisma.$queryRaw<
    { db: string }[]
  >`SELECT current_database() AS db`;
  console.log(
    `Base: ${db[0].db} · Modo: ${APLICAR ? 'APLICAR (guarda)' : 'SIMULACIÓN (no guarda nada)'}\n`,
  );

  const SIMULACION = new Error('simulacion');
  let resumen: Awaited<ReturnType<typeof importar>> | null = null;
  try {
    await prisma.$transaction(
      async (tx) => {
        resumen = await importar(tx, datos);
        // En simulación todo se deshace al final.
        if (!APLICAR) throw SIMULACION;
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    if (error !== SIMULACION) throw error;
  }

  const r = resumen!;
  log.forEach((l) => console.log(l));
  console.log('\n──── Resumen ────');
  console.log(`Cliente ${datos.cliente.companyname}: ${r.cliente}`);
  console.log(`Obra "${datos.obra.name}": ${r.obra}`);
  console.log(`Proveedor (mismo RUC): ${r.proveedor}`);
  console.log(
    `Vehículos: ${r.vehiculosCreados} creados, ${r.vehiculosExistentes} ya existían`,
  );
  console.log(
    APLICAR
      ? '\n✅ Guardado.'
      : '\nNada se guardó. Para guardar: npx ts-node prisma/importar-mit.ts --aplicar',
  );
}

main()
  .catch((e) => {
    console.error('❌', e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
