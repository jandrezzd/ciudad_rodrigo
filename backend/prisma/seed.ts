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

  const materials = await Promise.all(
    Object.values(MaterialType).map((type) =>
      prisma.material.create({
        data: { materialType: type },
      }),
    ),
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