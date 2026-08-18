import {
  CompanyStack,
  MaterialType,
  PrismaClient,
  ProveedorTipo,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const seedPassword = '123456';

/** El JSON se lee con fs y no con `import`: el tsconfig del backend no tiene
 *  resolveJsonModule y activarlo cambiaría la compilación de todo el proyecto. */
function leerJson<T>(nombre: string): T {
  const ruta = path.join(__dirname, 'data', nombre);
  return JSON.parse(fs.readFileSync(ruta, 'utf-8')) as T;
}

type CanterasData = {
  proveedorContenedor: {
    ruc: string;
    razonsocial: string;
    nombreComercial: string;
    tipo: string;
    email: string;
  };
  canteras: { nombre: string; direccion: string | null; isActive: boolean }[];
};

async function main() {
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  // upsert y no create: con create, la segunda corrida del seed muere en el
  // @unique de document y nunca llega a sembrar el resto.
  await prisma.user.upsert({
    where: { document: '1307857902' },
    update: {},
    create: {
      name: 'Carlos Manosalvas',
      document: '1307857902',
      email: 'carlosmanosalvas@gmail.com',
      password: passwordHash,
      role: Role.ADMIN,
      roletype: null,
      company: CompanyStack.CIUDAD_RODRIGO,
      phone: '+5930994494061',
    },
  });

  // El catálogo se siembra desde el enum, no desde el JSON: así nunca puede
  // quedar un material en la base que el código no sepa nombrar.
  // skipDuplicates lo hace re-ejecutable — los que ya existan conservan su id y
  // por lo tanto los viajes que los referencian siguen apuntando bien.
  const materials = await prisma.material.createMany({
    data: Object.values(MaterialType).map((type) => ({ materialType: type })),
    skipDuplicates: true,
  });

  const canteras = await seedCanteras();

  console.log(
    `✅ Seed completado (${materials.count} materiales nuevos, ${canteras} canteras nuevas)`,
  );
}

/**
 * Siembra el listado de canteras de prisma/data/canteras.json.
 *
 * Cantera.materialProviderId es obligatorio y la app solo lista canteras cuyo
 * proveedor está activo, así que las canteras no pueden existir sueltas: se
 * cuelgan de un proveedor provisional y se reasignan luego desde la UI.
 *
 * Idempotente sin índice único: se busca por nombre en TODA la tabla, no solo
 * dentro del proveedor provisional. Así una cantera ya reasignada a su
 * proveedor real no se vuelve a crear duplicada en la siguiente corrida.
 */
async function seedCanteras(): Promise<number> {
  const { proveedorContenedor, canteras } =
    leerJson<CanterasData>('canteras.json');

  const proveedor = await prisma.materialProvider.upsert({
    where: { ruc: proveedorContenedor.ruc },
    update: {},
    create: {
      ruc: proveedorContenedor.ruc,
      razonsocial: proveedorContenedor.razonsocial,
      nombreComercial: proveedorContenedor.nombreComercial,
      tipo: proveedorContenedor.tipo as ProveedorTipo,
      email: proveedorContenedor.email,
    },
  });

  let creadas = 0;

  for (const cantera of canteras) {
    const existente = await prisma.cantera.findFirst({
      where: { nombre: cantera.nombre },
      select: { id: true },
    });

    if (existente) continue;

    await prisma.cantera.create({
      data: {
        nombre: cantera.nombre,
        direccion: cantera.direccion,
        isActive: cantera.isActive,
        materialProviderId: proveedor.id,
      },
    });
    creadas++;
  }

  return creadas;
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
