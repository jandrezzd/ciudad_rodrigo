import { VentasService } from './ventas.service';
import { BusinessException } from '../common/business.exception';

/**
 * Reglas del alta de ventas.
 *
 * Se instancia el servicio a mano con un Prisma mockeado: no necesita el
 * contenedor de DI para probar esto, y así el test corre sin base de datos
 * (mismo criterio que transport-log.service.spec.ts).
 */

const UUID = '11111111-2222-4333-8444-555555555555';

const datosVenta = (extra: Record<string, any> = {}) => ({
  uuid: UUID,
  capturedAt: new Date().toISOString(),
  qrcode: 'VC-002',
  vehicleIdText: 'VI-003',
  materialId: '5',
  m3: '12.5',
  comprador: 'Constructora XYZ',
  observation: null,
  lat: '-2.1894',
  lng: '-79.889',
  ...extra,
});

const crearPrisma = (overrides: Record<string, any> = {}) => ({
  ventaCantera: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockImplementation(async ({ create }: any) => ({
      id: 1,
      ...create,
    })),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ id: 1, isActive: false }),
  },
  canteraVentaQr: {
    findUnique: jest.fn().mockResolvedValue({ canteraId: 2, isActive: true }),
  },
  material: { findUnique: jest.fn().mockResolvedValue({ id: 5 }) },
  vehicle: {
    findFirst: jest.fn().mockResolvedValue({
      id: 7,
      plate: 'MMM0000',
      driver: { name: 'Juan Pérez' },
    }),
  },
  ...overrides,
});

const crearServicio = (prisma: any) => new VentasService(prisma as any);

describe('VentasService.create', () => {
  it('registra la venta resolviendo el vehículo y guardando placa y chofer como copia', async () => {
    const prisma = crearPrisma();
    const venta = await crearServicio(prisma).create(3, datosVenta() as any, {});

    expect(prisma.ventaCantera.upsert).toHaveBeenCalledTimes(1);
    expect(venta.vehicleId).toBe(7);
    expect(venta.plate).toBe('MMM0000');
    expect(venta.driverName).toBe('Juan Pérez');
    expect(venta.canteraId).toBe(2);
    expect(venta.m3).toBe(12.5);
  });

  it('normaliza el qrcode a mayúsculas antes de buscarlo', async () => {
    const prisma = crearPrisma();
    await crearServicio(prisma).create(3, datosVenta({ qrcode: 'vc-002' }) as any, {});

    expect(prisma.canteraVentaQr.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { qrcode: 'VC-002' } }),
    );
  });

  it('es idempotente: un reenvío del mismo uuid devuelve la venta ya registrada sin volver a escribir', async () => {
    const prisma = crearPrisma();
    prisma.ventaCantera.findUnique.mockResolvedValue({ id: 42, uuid: UUID });

    const venta = await crearServicio(prisma).create(3, datosVenta() as any, {});

    expect(venta.id).toBe(42);
    expect(prisma.ventaCantera.upsert).not.toHaveBeenCalled();
  });

  it('registra la venta aunque el vehículo no esté en el catálogo: el camión ya salió', async () => {
    const prisma = crearPrisma();
    prisma.vehicle.findFirst.mockResolvedValue(null);

    const venta = await crearServicio(prisma).create(
      3,
      datosVenta({ vehicleIdText: 'NO-EXISTE' }) as any,
      {},
    );

    expect(venta.vehicleId).toBeNull();
    expect(venta.vehicleIdText).toBe('NO-EXISTE');
    expect(venta.plate).toBeNull();
  });

  it('acepta la venta aunque el punto de venta se haya dado de baja después del despacho', async () => {
    // Las ventas se acumulan días en el teléfono. Si en ese lapso alguien
    // desactiva el QR, rechazarlas las dejaría FAILED para siempre y el dato se
    // perdería: la baja vale hacia adelante, no borra lo ya ocurrido.
    const prisma = crearPrisma();
    prisma.canteraVentaQr.findUnique.mockResolvedValue({
      canteraId: 2,
      isActive: false,
    });

    const venta = await crearServicio(prisma).create(3, datosVenta() as any, {});

    expect(venta.canteraId).toBe(2);
    expect(prisma.ventaCantera.upsert).toHaveBeenCalledTimes(1);
  });

  it('rechaza sin reintento un QR que no existe: reenviarlo no lo va a hacer aparecer', async () => {
    const prisma = crearPrisma();
    prisma.canteraVentaQr.findUnique.mockResolvedValue(null);

    await expect(
      crearServicio(prisma).create(3, datosVenta() as any, {}),
    ).rejects.toMatchObject({
      code: 'VENTA_QR_NOT_FOUND',
      retryable: false,
    });
  });

  it('rechaza sin reintento un material inexistente', async () => {
    const prisma = crearPrisma();
    prisma.material.findUnique.mockResolvedValue(null);

    const error = await crearServicio(prisma)
      .create(3, datosVenta() as any, {})
      .catch((e) => e);

    expect(error).toBeInstanceOf(BusinessException);
    expect(error.code).toBe('MATERIAL_NOT_FOUND');
    expect(error.retryable).toBe(false);
  });

  it('guarda las rutas de las cuatro fotos relativas a la carpeta de ventas', async () => {
    const prisma = crearPrisma();
    const cwd = process.cwd();
    const files = {
      plate: [{ path: `${cwd}/uploads/ventas/venta-1.jpg` }],
      material: [{ path: `${cwd}/uploads/ventas/venta-2.jpg` }],
      driver: [{ path: `${cwd}/uploads/ventas/venta-3.jpg` }],
      vehicle: [{ path: `${cwd}/uploads/ventas/venta-4.jpg` }],
    };

    const venta = await crearServicio(prisma).create(3, datosVenta() as any, files);

    expect(venta.platePath).toBe('uploads/ventas/venta-1.jpg');
    expect(venta.materialPath).toBe('uploads/ventas/venta-2.jpg');
    expect(venta.driverPath).toBe('uploads/ventas/venta-3.jpg');
    expect(venta.vehiclePath).toBe('uploads/ventas/venta-4.jpg');
  });

  it('guarda null en las fotos que no se enviaron', async () => {
    const prisma = crearPrisma();
    const venta = await crearServicio(prisma).create(3, datosVenta() as any, {});

    expect(venta.platePath).toBeNull();
    expect(venta.materialPath).toBeNull();
  });
});

describe('VentasService.findAll', () => {
  it('lista solo las activas: el borrado es lógico', async () => {
    const prisma = crearPrisma();
    await crearServicio(prisma).findAll({});

    expect(prisma.ventaCantera.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('filtra por capturedAt, la hora real del despacho, no por createdAt', async () => {
    const prisma = crearPrisma();
    await crearServicio(prisma).findAll({
      desde: '2026-09-01',
      hasta: '2026-09-30',
    } as any);

    const where = prisma.ventaCantera.findMany.mock.calls[0][0].where;
    expect(where.capturedAt).toBeDefined();
    expect(where.createdAt).toBeUndefined();
  });

  it('toma el rango de fechas en hora de Ecuador, no en UTC', async () => {
    // Con `new Date('2026-09-30')` el límite superior caía a las 19:00 del día
    // 29 en Ecuador y el filtro dejaba fuera casi todo el último día del rango.
    const prisma = crearPrisma();
    await crearServicio(prisma).findAll({
      desde: '2026-09-01',
      hasta: '2026-09-30',
    } as any);

    const where = prisma.ventaCantera.findMany.mock.calls[0][0].where;
    expect(where.capturedAt.gte.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(where.capturedAt.lte.toISOString()).toBe('2026-10-01T04:59:59.999Z');
  });

  it('respeta una fecha que ya trae hora explícita', async () => {
    const prisma = crearPrisma();
    await crearServicio(prisma).findAll({
      desde: '2026-09-01T12:00:00.000Z',
    } as any);

    const where = prisma.ventaCantera.findMany.mock.calls[0][0].where;
    expect(where.capturedAt.gte.toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });

  it('ordena por capturedAt descendente', async () => {
    const prisma = crearPrisma();
    await crearServicio(prisma).findAll({});

    expect(prisma.ventaCantera.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { capturedAt: 'desc' } }),
    );
  });
});

describe('VentasService.remove', () => {
  it('no borra la fila: la marca inactiva', async () => {
    const prisma = crearPrisma();
    prisma.ventaCantera.findUnique.mockResolvedValue({ id: 1, isActive: true });

    await crearServicio(prisma).remove(1);

    expect(prisma.ventaCantera.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isActive: false },
    });
  });

  it('falla si la venta no existe', async () => {
    const prisma = crearPrisma();
    prisma.ventaCantera.findUnique.mockResolvedValue(null);

    await expect(crearServicio(prisma).remove(99)).rejects.toThrow(
      'LA VENTA NO EXISTE',
    );
  });
});

describe('VentasService.reporteConsumo', () => {
  it('agrupa por vehículo usando el texto tecleado, para no perder los no vinculados', async () => {
    const prisma = crearPrisma();
    prisma.ventaCantera.findMany.mockResolvedValue([
      {
        id: 1,
        canteraId: 2,
        materialId: 5,
        m3: 10,
        vehicleId: null,
        vehicleIdText: 'NO-EXISTE',
        plate: null,
        cantera: { nombre: 'La Chispa' },
        material: { materialType: 'ARENA_FINA' },
      },
      {
        id: 2,
        canteraId: 2,
        materialId: 5,
        m3: 5,
        vehicleId: 7,
        vehicleIdText: 'VI-003',
        plate: 'MMM0000',
        cantera: { nombre: 'La Chispa' },
        material: { materialType: 'ARENA_FINA' },
      },
    ]);

    const reporte = await crearServicio(prisma).reporteConsumo({});

    expect(reporte.totales).toEqual({ viajes: 2, m3: 15 });
    expect(reporte.porVehiculo).toHaveLength(2);
    // El vehículo sin vincular igual queda contabilizado.
    expect(reporte.porVehiculo.map((v) => v.id)).toContain('NO-EXISTE');
    expect(reporte.porCantera).toHaveLength(1);
    expect(reporte.porCantera[0].m3).toBe(15);
  });
});
