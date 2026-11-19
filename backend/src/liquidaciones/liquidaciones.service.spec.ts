import { Prisma } from '@prisma/client';
import { LiquidacionesService, WHERE_LIQUIDABLE } from './liquidaciones.service';

/** Prisma simulado: $transaction ejecuta el callback con el mismo mock. */
const crearPrisma = () => {
  const prisma: any = {
    transportTrip: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 26, notaLiquidador: 'ok' }),
    },
    liquidacion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 7 }),
      update: jest.fn().mockResolvedValue({}),
    },
    liquidacionViaje: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    liquidacionEdicion: { create: jest.fn().mockResolvedValue({}) },
    liquidacionSequence: {
      upsert: jest.fn().mockResolvedValue({ year: 2026, last: 1 }),
    },
  };
  prisma.$transaction = jest.fn((cb: (tx: any) => unknown) => cb(prisma));
  return prisma;
};

/** Viaje liquidable de la obra 3 y el cliente 5. */
const viaje = (id: number, extra: Record<string, any> = {}) => ({
  id,
  codigo: `TRA-${String(id).padStart(5, '0')}-2026`,
  status: 'COMPLETADO',
  arrivalAt: new Date('2026-11-18T14:00:00Z'),
  constSiteId: 3,
  clientId: 5,
  liquidacionViaje: null,
  ...extra,
});

/** Liquidación como la devuelve findUnique con DETALLE_INCLUDE. */
const detalleDb = (extra: Record<string, any> = {}) => ({
  id: 7,
  codigo: 'LIQ-0001-2026',
  fecha: new Date('2026-11-20T00:00:00Z'),
  montoTotal: new Prisma.Decimal(91),
  observacion: null,
  createdAt: new Date(),
  editadoEn: null,
  constSite: { id: 3, name: 'Pedro Velez' },
  client: { id: 5, name: 'GAD' },
  creadoPor: { id: 1, name: 'Admin' },
  editadoPor: null,
  viajes: [],
  ediciones: [],
  ...extra,
});

/** Liquidación como la lee `editar` (con sus viajes y el código de cada viaje). */
const actualDb = () => ({
  id: 7,
  fecha: new Date('2026-11-20T00:00:00Z'),
  montoTotal: new Prisma.Decimal(91),
  observacion: null,
  viajes: [
    { id: 1, tripId: 101, precio: new Prisma.Decimal(45.5), trip: { codigo: 'TRA-00101-2026' } },
    { id: 2, tripId: 102, precio: new Prisma.Decimal(45.5), trip: { codigo: 'TRA-00102-2026' } },
  ],
});

const errorP2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('LiquidacionesService', () => {
  let prisma: any;
  let service: LiquidacionesService;

  beforeEach(() => {
    prisma = crearPrisma();
    service = new LiquidacionesService(prisma);
  });

  describe('listarViajes', () => {
    beforeEach(() => prisma.transportTrip.findMany.mockResolvedValue([]));

    it('solo viajes emparejados, no cancelados y sin liquidar', async () => {
      await service.listarViajes({ constSiteId: 3, clientId: 5 });
      const args = prisma.transportTrip.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ ...WHERE_LIQUIDABLE, constSiteId: 3, clientId: 5 });
      expect(args.where.liquidacionViaje).toEqual({ is: null });
      expect(args.where.arrivalAt).toEqual({ not: null });
    });

    it('sin rango de fechas limita a 500; con rango no hay tope', async () => {
      await service.listarViajes({});
      expect(prisma.transportTrip.findMany.mock.calls[0][0].take).toBe(500);

      await service.listarViajes({ desde: '2026-11-01', hasta: '2026-11-30' });
      const conRango = prisma.transportTrip.findMany.mock.calls[1][0];
      expect(conRango.take).toBeUndefined();
      expect(conRango.where.AND).toHaveLength(1);
    });

    it('desde posterior a hasta: 400', async () => {
      await expect(
        service.listarViajes({ desde: '2026-12-01', hasta: '2026-11-01' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('crear', () => {
    const dto = (viajes = [{ tripId: 101, precio: 45.5 }, { tripId: 102, precio: 45.5 }]) => ({
      constSiteId: 3,
      clientId: 5,
      fecha: '2026-11-20',
      viajes,
    });

    beforeEach(() => {
      prisma.liquidacion.findUnique.mockResolvedValue(detalleDb());
    });

    it('calcula el total en el servidor y genera el código', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([viaje(101), viaje(102)]);
      // 0.1 + 0.2 sin errores de redondeo
      await service.crear(
        dto([{ tripId: 101, precio: 0.1 }, { tripId: 102, precio: 0.2 }]),
        1,
      );

      const data = prisma.liquidacion.create.mock.calls[0][0].data;
      expect(data.montoTotal).toBe(0.3);
      expect(data.codigo).toMatch(/^LIQ-0001-\d{4}$/);
      expect(data.creadoPorId).toBe(1);
      expect(data.fecha).toEqual(new Date('2026-11-20T00:00:00.000Z'));
      expect(data.viajes.create).toEqual([
        { tripId: 101, precio: 0.1 },
        { tripId: 102, precio: 0.2 },
      ]);
    });

    it('sin fecha usa el día de hoy', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([viaje(101)]);
      await service.crear({ constSiteId: 3, clientId: 5, viajes: [{ tripId: 101, precio: 10 }] }, 1);
      const fecha: Date = prisma.liquidacion.create.mock.calls[0][0].data.fecha;
      expect(fecha.toISOString()).toMatch(/T00:00:00\.000Z$/);
    });

    it('rechaza viajes de otra obra, de otro cliente, sin emparejar o ya liquidados', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([
        viaje(101, { constSiteId: 9 }),
        viaje(102, { clientId: 9 }),
        viaje(103, { arrivalAt: null }),
        viaje(104, { liquidacionViaje: { liquidacion: { codigo: 'LIQ-0002-2026' } } }),
      ]);

      const error = await service
        .crear(
          dto([101, 102, 103, 104, 105].map((tripId) => ({ tripId, precio: 1 }))),
          1,
        )
        .catch((e) => e);

      expect(error).toMatchObject({ code: 'LIQUIDACION_INVALIDA', statusCode: 400 });
      expect(error.message).toContain('TRA-00101-2026 (es de otra obra)');
      expect(error.message).toContain('TRA-00102-2026 (es de otro cliente)');
      expect(error.message).toContain('TRA-00103-2026 (no está emparejado');
      expect(error.message).toContain('TRA-00104-2026 (ya está en LIQ-0002-2026)');
      expect(error.message).toContain('viaje #105 (no existe)');
      expect(prisma.liquidacion.create).not.toHaveBeenCalled();
    });

    it('viajes repetidos: 400 sin tocar la base', async () => {
      await expect(
        service.crear(dto([{ tripId: 101, precio: 1 }, { tripId: 101, precio: 2 }]), 1),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si otro usuario liquidó el viaje al mismo tiempo (P2002): 409', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([viaje(101), viaje(102)]);
      prisma.liquidacion.create.mockRejectedValue(errorP2002());

      await expect(service.crear(dto(), 1)).rejects.toMatchObject({
        code: 'VIAJE_YA_LIQUIDADO',
        statusCode: 409,
      });
    });
  });

  describe('listar', () => {
    it('devuelve montos como número y la fecha como AAAA-MM-DD', async () => {
      prisma.liquidacion.findMany.mockResolvedValue([
        {
          id: 7,
          codigo: 'LIQ-0007-2026',
          fecha: new Date('2026-11-20T00:00:00Z'),
          montoTotal: new Prisma.Decimal('910.00'),
          editadoEn: null,
          constSite: { id: 3, name: 'Pedro Velez' },
          client: { id: 5, name: 'GAD', companyname: null },
          _count: { viajes: 20 },
        },
      ]);

      const [fila] = await service.listar({ codigo: ' 0007 ', constSiteId: 3 });

      expect(fila).toMatchObject({
        codigo: 'LIQ-0007-2026',
        montoTotal: 910,
        fecha: '2026-11-20',
        cantidadViajes: 20,
      });
      const where = prisma.liquidacion.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        constSiteId: 3,
        codigo: { contains: '0007', mode: 'insensitive' },
      });
    });
  });

  describe('editar', () => {
    beforeEach(() => {
      prisma.liquidacion.findUnique
        .mockResolvedValueOnce(actualDb()) // lectura dentro de la transacción
        .mockResolvedValueOnce(detalleDb()); // detalle devuelto
    });

    it('sin cambios: 400', async () => {
      await expect(
        service.editar(
          7,
          {
            motivo: 'revisión',
            fecha: '2026-11-20',
            viajes: [{ tripId: 101, precio: 45.5 }, { tripId: 102, precio: 45.5 }],
          },
          4,
        ),
      ).rejects.toMatchObject({ code: 'SIN_CAMBIOS', statusCode: 400 });
      expect(prisma.liquidacionEdicion.create).not.toHaveBeenCalled();
    });

    it('no se pueden quitar todos los viajes', async () => {
      await expect(
        service.editar(7, { motivo: 'quitar todo', viajes: [] }, 4),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.liquidacionViaje.deleteMany).not.toHaveBeenCalled();
    });

    it('no se pueden agregar viajes al editar', async () => {
      await expect(
        service.editar(7, { motivo: 'agregar', viajes: [{ tripId: 999, precio: 1 }] }, 4),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('cambiar un precio: recalcula el total y registra antes y después', async () => {
      await service.editar(
        7,
        {
          motivo: 'Precio acordado cambió',
          viajes: [{ tripId: 101, precio: 50 }, { tripId: 102, precio: 45.5 }],
        },
        4,
      );

      expect(prisma.liquidacionViaje.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { precio: 50 },
      });
      const update = prisma.liquidacion.update.mock.calls[0][0];
      expect(update.data).toMatchObject({ montoTotal: 95.5, editadoPorId: 4 });
      expect(update.data.editadoEn).toBeInstanceOf(Date);

      const edicion = prisma.liquidacionEdicion.create.mock.calls[0][0].data;
      expect(edicion).toMatchObject({ liquidacionId: 7, userId: 4, motivo: 'Precio acordado cambió' });
      expect(edicion.cambios).toEqual({
        precios: [{ tripId: 101, codigo: 'TRA-00101-2026', antes: 45.5, despues: 50 }],
        montoTotal: { antes: 91, despues: 95.5 },
      });
    });

    it('quitar un viaje lo borra de la liquidación (vuelve a ser liquidable)', async () => {
      await service.editar(
        7,
        { motivo: 'viaje duplicado', viajes: [{ tripId: 101, precio: 45.5 }] },
        4,
      );

      expect(prisma.liquidacionViaje.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [2] } },
      });
      expect(prisma.liquidacion.update.mock.calls[0][0].data.montoTotal).toBe(45.5);
      expect(prisma.liquidacionEdicion.create.mock.calls[0][0].data.cambios).toMatchObject({
        quitados: [{ tripId: 102, codigo: 'TRA-00102-2026', precio: 45.5 }],
      });
    });

    it('cambia la fecha y borra la observación', async () => {
      prisma.liquidacion.findUnique.mockReset();
      prisma.liquidacion.findUnique
        .mockResolvedValueOnce({ ...actualDb(), observacion: 'vieja' })
        .mockResolvedValueOnce(detalleDb());

      await service.editar(7, { motivo: 'corrección', fecha: '2026-11-21', observacion: null }, 4);

      const data = prisma.liquidacion.update.mock.calls[0][0].data;
      expect(data.fecha).toEqual(new Date('2026-11-21T00:00:00.000Z'));
      expect(data.observacion).toBeNull();
      expect(prisma.liquidacionEdicion.create.mock.calls[0][0].data.cambios).toEqual({
        fecha: { antes: '2026-11-20', despues: '2026-11-21' },
        observacion: { antes: 'vieja', despues: null },
      });
    });

    it('liquidación inexistente: 404', async () => {
      prisma.liquidacion.findUnique.mockReset();
      prisma.liquidacion.findUnique.mockResolvedValue(null);
      await expect(service.editar(99, { motivo: 'xxxxx', fecha: '2026-11-21' }, 4)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('anular', () => {
    const conViajes = () => ({
      ...actualDb(),
      codigo: 'LIQ-0001-2026',
      estado: 'ACTIVA',
      viajes: [
        {
          tripId: 101,
          precio: new Prisma.Decimal(45.5),
          trip: {
            codigo: 'TRA-00101-2026',
            departureAt: null,
            arrivalAt: null,
            notaLiquidador: 'revisado',
            vehicle: { plate: 'GBQ3700', vehicleid: 'V-12' },
            driver: { name: 'Juan' },
            material: null,
            departure: { m3: 13, m3Corrected: 12 },
            arrival: { m3: 13, m3Corrected: null },
          },
        },
      ],
    });

    it('marca ANULADA, guarda la foto de los viajes y los libera', async () => {
      prisma.liquidacion.findUnique
        .mockResolvedValueOnce(conViajes())
        .mockResolvedValueOnce(detalleDb({ estado: 'ANULADA' }));

      await service.anular(7, 'Se cargó a otro cliente', 4);

      expect(prisma.liquidacionViaje.deleteMany).toHaveBeenCalledWith({
        where: { liquidacionId: 7 },
      });
      const data = prisma.liquidacion.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        estado: 'ANULADA',
        anuladaPorId: 4,
        motivoAnulacion: 'Se cargó a otro cliente',
      });
      expect(data.anuladaEn).toBeInstanceOf(Date);
      expect(data.viajesAnulados).toEqual([
        expect.objectContaining({
          tripId: 101,
          codigo: 'TRA-00101-2026',
          m3Salida: 12,
          precio: 45.5,
          notaLiquidador: 'revisado',
        }),
      ]);
      expect(prisma.liquidacionEdicion.create.mock.calls[0][0].data).toMatchObject({
        motivo: 'Se cargó a otro cliente',
        cambios: { anulada: { viajes: 1, montoTotal: 91 } },
      });
    });

    it('una anulada no se vuelve a anular ni se edita', async () => {
      prisma.liquidacion.findUnique.mockResolvedValue({ ...conViajes(), estado: 'ANULADA' });

      await expect(service.anular(7, 'otra vez', 4)).rejects.toMatchObject({
        code: 'LIQUIDACION_ANULADA',
        statusCode: 400,
      });
      await expect(
        service.editar(7, { motivo: 'cambiar', fecha: '2026-11-21' }, 4),
      ).rejects.toMatchObject({ code: 'LIQUIDACION_ANULADA' });
      expect(prisma.liquidacionViaje.deleteMany).not.toHaveBeenCalled();
    });

    it('el detalle de una anulada muestra los viajes de la foto', async () => {
      prisma.liquidacion.findUnique.mockResolvedValue(
        detalleDb({
          estado: 'ANULADA',
          motivoAnulacion: 'error',
          anuladaPor: { id: 4, name: 'Jefe' },
          viajesAnulados: [{ tripId: 101, codigo: 'TRA-00101-2026', precio: 45.5 }],
          viajes: [],
        }),
      );
      const d = await service.detalle(7);
      expect(d.estado).toBe('ANULADA');
      expect(d.viajes).toEqual([{ tripId: 101, codigo: 'TRA-00101-2026', precio: 45.5 }]);
      expect(d.anuladaPor).toEqual({ id: 4, name: 'Jefe' });
    });

    it('el historial cuenta los viajes de una anulada y filtra por estado y cliente', async () => {
      prisma.liquidacion.findMany.mockResolvedValue([
        {
          id: 7,
          codigo: 'LIQ-0001-2026',
          fecha: new Date('2026-11-20T00:00:00Z'),
          montoTotal: new Prisma.Decimal(91),
          estado: 'ANULADA',
          viajesAnulados: [{ tripId: 1 }, { tripId: 2 }],
          editadoEn: null,
          anuladaEn: new Date(),
          constSite: { id: 3, name: 'Obra' },
          client: { id: 5, name: 'GAD', companyname: null },
          _count: { viajes: 0 },
        },
      ]);
      const [fila] = await service.listar({ estado: 'ANULADA', clientId: 5 });
      expect(fila).toMatchObject({ estado: 'ANULADA', cantidadViajes: 2 });
      expect(prisma.liquidacion.findMany.mock.calls[0][0].where).toMatchObject({
        estado: 'ANULADA',
        clientId: 5,
      });
    });
  });

  describe('nota del liquidador', () => {
    it('guarda la nota con quién y cuándo', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue({ id: 26 });
      await service.guardarNotaViaje(26, 'Precio acordado por teléfono', 4);
      const args = prisma.transportTrip.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 26 });
      expect(args.data).toMatchObject({
        notaLiquidador: 'Precio acordado por teléfono',
        notaLiquidadorPorId: 4,
      });
      expect(args.data.notaLiquidadorEn).toBeInstanceOf(Date);
    });

    it('viaje inexistente: 404', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue(null);
      await expect(service.guardarNotaViaje(999, 'x', 4)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('detalle', () => {
    it('usa los m³ corregidos si existen', async () => {
      prisma.liquidacion.findUnique.mockResolvedValue(
        detalleDb({
          viajes: [
            {
              tripId: 101,
              precio: new Prisma.Decimal(45.5),
              trip: {
                codigo: 'TRA-00101-2026',
                departureAt: null,
                arrivalAt: null,
                vehicle: { plate: 'GBQ3700', vehicleid: 'V-12' },
                driver: { name: 'Juan' },
                material: { materialType: 'RIPIO' },
                departure: { m3: 14, m3Corrected: 13 },
                arrival: { m3: 13, m3Corrected: null },
              },
            },
          ],
        }),
      );

      const d = await service.detalle(7);

      expect(d.viajes[0]).toMatchObject({
        placa: 'GBQ3700',
        m3Salida: 13,
        m3Llegada: 13,
        precio: 45.5,
      });
      expect(d.montoTotal).toBe(91);
      expect(d.fecha).toBe('2026-11-20');
    });
  });
});
