import { ConflictException, NotFoundException } from '@nestjs/common';
import { TransportistasService } from './transportistas.service';

const crearPrisma = (existente: any = null) => ({
  transportista: {
    findFirst: jest.fn().mockResolvedValue(existente),
    findUnique: jest.fn().mockResolvedValue(existente),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async ({ data }: any) => ({
      id: 1,
      isActive: true,
      ...data,
    })),
    update: jest.fn().mockImplementation(async ({ where, data }: any) => ({
      ...existente,
      id: where.id,
      ...data,
    })),
  },
});

describe('TransportistasService', () => {
  it('crea uno nuevo con el nombre limpio de espacios', async () => {
    const prisma = crearPrisma();
    const t = await new TransportistasService(prisma as any).create(
      '  Trans   Pérez  ',
    );

    expect(prisma.transportista.create).toHaveBeenCalledWith({
      data: { name: 'Trans Pérez' },
    });
    expect(t.yaExistia).toBe(false);
  });

  it('no duplica: con otro uso de mayúsculas devuelve el existente', async () => {
    const prisma = crearPrisma({ id: 7, name: 'TRANS PÉREZ', isActive: true });
    const t = await new TransportistasService(prisma as any).create(
      'trans pérez',
    );

    expect(prisma.transportista.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'trans pérez', mode: 'insensitive' } },
    });
    expect(prisma.transportista.create).not.toHaveBeenCalled();
    expect(t).toMatchObject({ id: 7, yaExistia: true });
  });

  it('reactiva uno dado de baja al volver a elegirlo', async () => {
    const prisma = crearPrisma({ id: 7, name: 'TRANS', isActive: false });
    const t = await new TransportistasService(prisma as any).create('Trans');

    expect(prisma.transportista.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { isActive: true },
    });
    expect(t).toMatchObject({ isActive: true, yaExistia: true });
  });

  it('al renombrar rechaza un nombre que ya usa otro transportista', async () => {
    const prisma = crearPrisma({ id: 9, name: 'OTRO', isActive: true });
    prisma.transportista.findUnique.mockResolvedValue({ id: 7 });

    await expect(
      new TransportistasService(prisma as any).update(7, 'otro'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('al renombrar uno que no existe responde 404', async () => {
    const prisma = crearPrisma();

    await expect(
      new TransportistasService(prisma as any).update(99, 'Nuevo'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
