import { Prisma } from '@prisma/client';
import { ClientsService } from './clients.service';

/**
 * Crear un cliente arma también su obra (sin duplicarla) y, si es público, su
 * proveedor. Editarlo no cambia su tipo y corrige el RUC en su proveedor.
 */
const crearPrisma = () => {
  const tx: any = {
    client: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 10,
        ...data,
      })),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 10, ruc: '0990000000001', constSites: [] }),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 10,
        ...data,
      })),
    },
    constSite: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 20 }),
    },
    clientConstSite: { upsert: jest.fn().mockResolvedValue({}) },
    owner: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 30,
        ...data,
      })),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
};

const datosCliente = (extra: Record<string, any> = {}) => ({
  ruc: '0990000000001',
  companyname: 'CONSTRUCTORA XYZ S.A.',
  ...extra,
});

describe('ClientsService.create', () => {
  it('crea la obra con la razón social y la vincula al cliente', async () => {
    const { prisma, tx } = crearPrisma();

    await new ClientsService(prisma).create(datosCliente());

    expect(tx.constSite.create).toHaveBeenCalledWith({
      data: { name: 'CONSTRUCTORA XYZ S.A.' },
    });
    expect(tx.clientConstSite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { clientId: 10, constSiteId: 20 } }),
    );
  });

  it('si ya existe una obra con ese nombre, la reutiliza en vez de duplicarla', async () => {
    const { prisma, tx } = crearPrisma();
    tx.constSite.findFirst.mockResolvedValue({
      id: 77,
      name: 'Constructora XYZ S.A.',
    });

    await new ClientsService(prisma).create(datosCliente());

    expect(tx.constSite.create).not.toHaveBeenCalled();
    expect(tx.clientConstSite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { clientId: 10, constSiteId: 77 } }),
    );
  });

  it('cliente privado: no crea proveedor', async () => {
    const { prisma, tx } = crearPrisma();

    const res: any = await new ClientsService(prisma).create(
      datosCliente({ type: 'PRIVADO' }),
    );

    expect(tx.owner.create).not.toHaveBeenCalled();
    expect(res.proveedor).toBeNull();
  });

  it('cliente público: crea el proveedor con el mismo RUC y razón social', async () => {
    const { prisma, tx } = crearPrisma();

    const res: any = await new ClientsService(prisma).create(
      datosCliente({ type: 'PUBLICO' }),
    );

    expect(tx.owner.create).toHaveBeenCalledWith({
      data: { ruc: '0990000000001', companyname: 'CONSTRUCTORA XYZ S.A.' },
    });
    expect(res.proveedor.id).toBe(30);
  });

  it('cliente público: reutiliza el proveedor si ya existía con ese RUC', async () => {
    const { prisma, tx } = crearPrisma();
    tx.owner.findUnique.mockResolvedValue({ id: 5, ruc: '0990000000001' });

    const res: any = await new ClientsService(prisma).create(
      datosCliente({ type: 'PUBLICO' }),
    );

    expect(tx.owner.create).not.toHaveBeenCalled();
    expect(res.proveedor.id).toBe(5);
  });

  it('RUC repetido devuelve un 409 claro, no un 500', async () => {
    const { prisma } = crearPrisma();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['ruc'] },
      }),
    );

    await expect(
      new ClientsService(prisma).create(datosCliente()),
    ).rejects.toMatchObject({
      status: 409,
      message: 'YA EXISTE UN CLIENTE CON ESE RUC',
    });
  });
});

describe('ClientsService.update', () => {
  it('no cambia el tipo del cliente aunque venga en los datos', async () => {
    const { prisma, tx } = crearPrisma();

    await new ClientsService(prisma).update(10, {
      type: 'PRIVADO',
      phone: '0999999999',
    });

    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { phone: '0999999999' },
    });
  });

  it('al corregir el RUC lo corrige también en su proveedor', async () => {
    const { prisma, tx } = crearPrisma();
    tx.owner.findUnique.mockImplementation(async ({ where }: any) =>
      where.ruc === '0990000000001' ? { id: 30 } : null,
    );

    await new ClientsService(prisma).update(10, { ruc: '0990000000002' });

    expect(tx.owner.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { ruc: '0990000000002' },
    });
  });

  it('si el RUC nuevo ya es de otro proveedor, avisa con 409 y no cambia nada', async () => {
    const { prisma, tx } = crearPrisma();
    tx.owner.findUnique.mockImplementation(async ({ where }: any) =>
      where.ruc === '0990000000001' ? { id: 30 } : { id: 31 },
    );

    await expect(
      new ClientsService(prisma).update(10, { ruc: '0990000000002' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.owner.update).not.toHaveBeenCalled();
    expect(tx.client.update).not.toHaveBeenCalled();
  });

  it('sin proveedor (cliente privado) solo cambia el RUC del cliente', async () => {
    const { prisma, tx } = crearPrisma();

    await new ClientsService(prisma).update(10, { ruc: '0990000000002' });

    expect(tx.owner.update).not.toHaveBeenCalled();
    expect(tx.client.update).toHaveBeenCalled();
  });
});
