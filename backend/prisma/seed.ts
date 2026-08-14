import {
  CompanyStack,
  MaterialType,
  PrismaClient,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const seedPassword = '123456';


async function main() {
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Carlos Manosalvas',
        document: '1307857902',
        email: 'carlosmanosalvas@gmail.com',
        password: passwordHash,
        role: Role.ADMIN,
        roletype: null,
        company: CompanyStack.CIUDAD_RODRIGO,
        phone: '+5930994494061',
      },
    })]);

  // El catálogo se siembra desde el enum, no desde el JSON: así nunca puede
  // quedar un material en la base que el código no sepa nombrar.
  // skipDuplicates lo hace re-ejecutable — los que ya existan conservan su id y
  // por lo tanto los viajes que los referencian siguen apuntando bien.
  const materials = await prisma.material.createMany({
    data: Object.values(MaterialType).map((type) => ({ materialType: type })),
    skipDuplicates: true,
  });

  console.log(`✅ Seed completado (${materials.count} materiales nuevos)`);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });