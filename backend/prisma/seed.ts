import {
  CompanyStack,
  DriverCargo,
  DriverTipo,
  MaterialType,
  PrismaClient,
  ProveedorTipo,
  Role,
  RoleType,
  VehicleCompany,
  VehicleType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const seedPassword = '123456';

interface CanteraSeed {
  nombre: string;
  direccion: string | null;
  isActive: boolean;
}

interface CanterasSeedFile {
  proveedorContenedor: {
    nota?: string;
    ruc: string;
    razonsocial: string;
    nombreComercial: string;
    tipo: ProveedorTipo;
    email: string;
  };
  canteras: CanteraSeed[];
}

interface ProveedorMaterialSeed {
  razonsocial: string;
  tipo: ProveedorTipo;
  direccion: string | null;
  isActive: boolean;
}

interface ProveedoresMaterialSeedFile {
  proveedores: ProveedorMaterialSeed[];
}

interface VehiculoInternoSeed {
  vehicleid: string;
  plate: string;
  type: VehicleType;
  company: VehicleCompany;
  estado: 'existente' | 'nuevo';
}

interface VehiculosInternosSeedFile {
  placeholders: { brand: string; model: string; year: string; capacity: number };
  vehiculos: VehiculoInternoSeed[];
}

interface ChoferInternoSeed {
  document: string;
  name: string;
  cargo: DriverCargo;
  estado: 'existente' | 'nuevo';
  /// Solo en los 'existente': el nombre con el que el chofer está guardado en
  /// producción, que casi nunca coincide con el del listado de la empresa.
  nombreEnProduccion?: string;
}

interface ChoferesInternosSeedFile {
  choferes: ChoferInternoSeed[];
}

/// Sin tildes, sin espacios de sobra y en minúsculas: los nombres de
/// producción vienen escritos a mano ("Manuel Párraga", " Walter Almeida") y
/// una comparación literal no encontraría a nadie.
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function main() {
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  // upsert y no create: con create, la segunda corrida del seed muere en el
  // @unique de document y nunca llega a sembrar el resto.
  //primer adminsitrador de la empresa
  await prisma.user.upsert({
    where: { document: '1308994050' },
    update: {},
    create: {
      name: 'SANCAN PINCAY FRANCISCO SEBASTIAN',
      document: '1308994050',
      email: 'sancan.web@ciudadrodrigo.com.ec',
      password: passwordHash,
      role: Role.ADMIN,
      roletype: null,
      company: CompanyStack.CIUDAD_RODRIGO,
      phone: '+593988695706',
    },
  });
  //segundo administrador de la empresa / antiguo administrador de la empresa
  await prisma.user.upsert({
    where: { document: '1307857902' },
    update: {},
    create: {
      name: 'Julian Intriago',
      document: '1312147984',
      email: 'Admin@gmail.com',
      password: passwordHash,
      role: Role.ADMIN,
      roletype: null,
      company: CompanyStack.CIUDAD_RODRIGO,
      phone: '+5930994494061',
    },
  });
  await prisma.user.upsert({
    where: { document: '1317119954' },
    update: {},
    create: {
      name: 'ARAUZ QUIROZ KARLA',
      document: '1317119954',
      email: 'karla.web@ciudadrodrigo.com.ec',
      password: passwordHash,
      role: Role.ADMIN,
      roletype: null,
      company: CompanyStack.CIUDAD_RODRIGO,
      phone: '+593959845838',
    },
  });
  //supervisor de cantera
  await prisma.user.upsert({
    where: { document: '1250575550' },
    update: {},
    create: {
      name: 'Vicente Rosado',
      document: '1250575550',
      email: 'vicente.cantera@cr.com',
      password: passwordHash,
      role: Role.SUPERVISOR,
      roletype: RoleType.CANTERA,
      company: CompanyStack.CIUDAD_RODRIGO,
      phone: '+593992021209',
    },
  });
  //supervisor de obra
  await prisma.user.upsert({
    where: { document: '1205504366' },
    update: {},
    create: {
      name: 'Cesar Alfredo',
      document: '1205504366',
      email: 'alfredo.obra@cr.com',
      password: passwordHash,
      role: Role.SUPERVISOR,
      roletype: RoleType.OBRA,
      company: CompanyStack.CIUDAD_RODRIGO,
      phone: '+593988844163',
    },
  });
  //jefe de obra
  await prisma.user.upsert({
    where: { document: '0933445566' },
    update: {},
    create: {
      name: 'Karla Gómez',
      document: '0933445566',
      email: 'kgomez@cr.com',
      password: passwordHash,
      role: Role.JEFE_DE_OBRA,
      roletype: null,
      company: CompanyStack.CIUDAD_RODRIGO,
      phone: '+593993456789',
    },
  });

  // createMany + skipDuplicates: el catálogo se siembra desde el enum, así
  // nunca queda un material en la base que el código no sepa nombrar, y es
  // reejecutable sin chocar con los materiales ya creados.
  await prisma.material.createMany({
    data: Object.values(MaterialType).map((type) => ({ materialType: type })),
    skipDuplicates: true,
  });

  // Canteras heredadas del listado de la empresa: se cuelgan de un proveedor
  // provisional (ver prisma/data/canteras.json) y se reasignan a su proveedor
  // real después, cantera por cantera, desde Proveedores de Material.
  const canterasSeedPath = path.join(__dirname, 'data', 'canteras.json');
  const canterasSeedData = JSON.parse(
    fs.readFileSync(canterasSeedPath, 'utf-8'),
  ) as CanterasSeedFile;

  // `nota` es solo documentación del JSON, no una columna de MaterialProvider:
  // se listan los campos a propósito en vez de esparcir el objeto completo.
  const { ruc, razonsocial, nombreComercial, tipo, email } =
    canterasSeedData.proveedorContenedor;
  const proveedorContenedorData = {
    ruc,
    razonsocial,
    nombreComercial,
    tipo,
    email,
  };

  const proveedorSinAsignar = await prisma.materialProvider.upsert({
    where: { ruc: proveedorContenedorData.ruc },
    update: {},
    create: proveedorContenedorData,
  });

  for (const cantera of canterasSeedData.canteras) {
    const yaExiste = await prisma.cantera.findFirst({
      where: {
        materialProviderId: proveedorSinAsignar.id,
        nombre: cantera.nombre,
      },
      select: { id: true },
    });
    if (!yaExiste) {
      await prisma.cantera.create({
        data: { ...cantera, materialProviderId: proveedorSinAsignar.id },
      });
    }
  }

  // Proveedores de material del listado de la empresa, sin RUC/email todavía
  // (ver prisma/data/proveedores-material.json). Se completan y se les
  // reasignan sus canteras después, desde la pantalla de Proveedores de Material.
  const proveedoresSeedPath = path.join(
    __dirname,
    'data',
    'proveedores-material.json',
  );
  const proveedoresSeedData = JSON.parse(
    fs.readFileSync(proveedoresSeedPath, 'utf-8'),
  ) as ProveedoresMaterialSeedFile;

  for (const proveedor of proveedoresSeedData.proveedores) {
    const yaExiste = await prisma.materialProvider.findFirst({
      where: { razonsocial: proveedor.razonsocial },
      select: { id: true },
    });
    if (!yaExiste) {
      await prisma.materialProvider.create({ data: proveedor });
    }
  }

  // Flota interna de Ciudad Rodrigo y Transvélez (ver prisma/data/vehiculos-internos.json).
  // Solo se siembran los campos obligatorios (código, placa, tipo y empresa); marca,
  // modelo, año y capacidad quedan en placeholder y se completan a mano desde Vehículos.
  const vehiculosSeedPath = path.join(
    __dirname,
    'data',
    'vehiculos-internos.json',
  );
  const vehiculosSeedData = JSON.parse(
    fs.readFileSync(vehiculosSeedPath, 'utf-8'),
  ) as VehiculosInternosSeedFile;

  // vehicleid y plate son @unique: se compara contra lo que ya hay en la base y se
  // salta el vehículo si CUALQUIERA de los dos ya está tomado. Así el seed nunca
  // pisa lo que producción ya tiene ni revienta por conflicto de unicidad.
  const vehiculosExistentes = await prisma.vehicle.findMany({
    select: { vehicleid: true, plate: true },
  });
  const codigosTomados = new Set(vehiculosExistentes.map((v) => v.vehicleid));
  const placasTomadas = new Set(vehiculosExistentes.map((v) => v.plate));

  const { brand, model, year, capacity } = vehiculosSeedData.placeholders;
  const vehiculosACrear = vehiculosSeedData.vehiculos.filter((vehiculo) => {
    const codigoTomado = codigosTomados.has(vehiculo.vehicleid);
    const placaTomada = placasTomadas.has(vehiculo.plate);
    if (codigoTomado !== placaTomada) {
      console.warn(
        `⚠️  ${vehiculo.vehicleid} / ${vehiculo.plate}: ${
          codigoTomado ? 'el código' : 'la placa'
        } ya existe en la base con datos distintos a los del listado. Se omite; revisar a mano.`,
      );
    }
    return !codigoTomado && !placaTomada;
  });

  if (vehiculosACrear.length > 0) {
    await prisma.vehicle.createMany({
      data: vehiculosACrear.map((vehiculo) => ({
        vehicleid: vehiculo.vehicleid,
        plate: vehiculo.plate,
        type: vehiculo.type,
        company: vehiculo.company,
        brand,
        model,
        year,
        capacity,
      })),
    });
  }
  console.log(
    `🚚 Vehículos internos: ${vehiculosACrear.length} creados, ${
      vehiculosSeedData.vehiculos.length - vehiculosACrear.length
    } ya existían`,
  );

  // Choferes internos del listado de la empresa (ver prisma/data/choferes-internos.json).
  // 11 de los 16 que ya están en producción salen en el listado: a esos solo se
  // les completa cédula y cargo. Los otros 5 de producción no están en el
  // listado y el seed no los toca (quedan como INTERNO sin cédula).
  const choferesSeedPath = path.join(__dirname, 'data', 'choferes-internos.json');
  const choferesSeedData = JSON.parse(
    fs.readFileSync(choferesSeedPath, 'utf-8'),
  ) as ChoferesInternosSeedFile;

  const choferesEnBase = await prisma.driver.findMany({
    select: { id: true, name: true, document: true },
  });
  const idPorDocumento = new Map(
    choferesEnBase
      .filter((c): c is typeof c & { document: string } => !!c.document)
      .map((c) => [c.document, c.id]),
  );
  // Solo se indexa el primer chofer de cada nombre normalizado: si producción
  // llegara a tener dos con el mismo nombre, actualizar a ciegas el segundo
  // sería peor que dejarlo como está.
  const idPorNombre = new Map<string, number>();
  for (const chofer of choferesEnBase) {
    const clave = normalizarNombre(chofer.name);
    if (!idPorNombre.has(clave)) idPorNombre.set(clave, chofer.id);
  }

  let choferesCompletados = 0;
  let choferesCreados = 0;
  for (const chofer of choferesSeedData.choferes) {
    // La cédula manda: en la segunda corrida ya está guardada y el mapeo por
    // nombre deja de hacer falta.
    const id =
      idPorDocumento.get(chofer.document) ??
      (chofer.nombreEnProduccion
        ? idPorNombre.get(normalizarNombre(chofer.nombreEnProduccion))
        : undefined);

    if (id) {
      // No se pisa `name`: el nombre que el usuario viene viendo en producción
      // se respeta, solo se completa lo que falta.
      await prisma.driver.update({
        where: { id },
        data: {
          document: chofer.document,
          cargo: chofer.cargo,
          tipo: DriverTipo.INTERNO,
        },
      });
      choferesCompletados++;
    } else {
      await prisma.driver.create({
        data: {
          name: chofer.name,
          document: chofer.document,
          cargo: chofer.cargo,
          tipo: DriverTipo.INTERNO,
        },
      });
      choferesCreados++;
    }
  }
  console.log(
    `👷 Choferes internos: ${choferesCreados} creados, ${choferesCompletados} completados (cédula + cargo)`,
  );

  console.log('✅ Seed completado');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
