import {
  CompanyStack,
  MaterialType,
  PrismaClient,
  Role,
  RoleType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const seedPassword = '123456';

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
      email: 'sancan@ciudadrodrigo.com.ec',
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
  await prisma.user.upsert({
    where: { document: '1317119954' },
    update: {},
    create: {
      name: 'ARAUZ QUIROZ KARLA',
      document: '1317119954',
      email: 'karla.arauz@ciudadrodrigo.com.ec',
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
      email: 'vrosado@cr.com',
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
      email: 'alfredo@cr.com',
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

  console.log('✅ Seed completado');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });