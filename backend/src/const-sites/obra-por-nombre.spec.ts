import { ConstSitesService } from './const-sites.service';

const crearPrisma = () => ({
  constSite: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest
      .fn()
      .mockResolvedValue({ id: 77, name: 'OBRA NORTE', clients: [] }),
    create: jest
      .fn()
      .mockResolvedValue({ id: 80, name: 'OBRA NUEVA', clients: [] }),
    update: jest.fn().mockResolvedValue({ id: 77 }),
  },
  clientConstSite: { upsert: jest.fn().mockResolvedValue({}) },
});

describe('ConstSitesService — obras sin duplicar', () => {
  it('crear con un nombre que ya existe devuelve esa obra sin crear otra', async () => {
    const prisma: any = crearPrisma();
    prisma.constSite.findFirst.mockResolvedValue({ id: 77, name: 'OBRA NORTE' });

    const res: any = await new ConstSitesService(prisma).create({
      name: ' obra norte ',
    });

    expect(prisma.constSite.create).not.toHaveBeenCalled();
    expect(res.id).toBe(77);
    expect(res.yaExistia).toBe(true);
    expect(prisma.constSite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { equals: 'obra norte', mode: 'insensitive' } },
      }),
    );
  });

  it('crear con un nombre nuevo crea la obra', async () => {
    const prisma: any = crearPrisma();

    const res: any = await new ConstSitesService(prisma).create({
      name: 'Obra Nueva',
    });

    expect(prisma.constSite.create).toHaveBeenCalled();
    expect(res.yaExistia).toBe(false);
  });

  it('no deja renombrar una obra con el nombre de otra', async () => {
    const prisma: any = crearPrisma();
    prisma.constSite.findFirst.mockResolvedValue({ id: 50, name: 'OBRA SUR' });

    await expect(
      new ConstSitesService(prisma).update(77, { name: 'Obra Sur' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.constSite.update).not.toHaveBeenCalled();
  });

  it('vincular un cliente ya vinculado no falla', async () => {
    const prisma: any = crearPrisma();

    await new ConstSitesService(prisma).addClient(77, 10);

    expect(prisma.clientConstSite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId_constSiteId: { clientId: 10, constSiteId: 77 } },
        update: {},
      }),
    );
  });
});
