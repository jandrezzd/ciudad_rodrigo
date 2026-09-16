import { VentasStockService } from './ventas-stock.service';

/**
 * Reglas del stock de ventas.
 *
 * Se instancia el servicio a mano con un Prisma mockeado, igual que
 * ventas.service.spec.ts: no hace falta el contenedor de DI ni una base de datos
 * para probar la aritmética del saldo y las garantías de idempotencia.
 */

const crearTx = () => ({
  ventaCanteraStock: {
    upsert: jest.fn().mockResolvedValue({ id: 10, m3Asignados: 100 }),
  },
  ventaStockMovimiento: {
    upsert: jest.fn().mockImplementation(async ({ create }: any) => ({
      id: 99,
      ...create,
    })),
    findUnique: jest.fn().mockResolvedValue({ id: 99 }),
    update: jest.fn().mockImplementation(async ({ data }: any) => ({
      id: 99,
      ...data,
    })),
  },
});

const crearServicio = (prisma: any = {}) =>
  new VentasStockService(prisma as any);

describe('VentasStockService.registrarSalida', () => {
  it('descuenta la venta y crea la fila de stock si la cantera no tenía ese material', async () => {
    const tx = crearTx();
    const capturedAt = new Date('2026-09-15T10:00:00.000Z');

    const movimiento = await crearServicio().registrarSalida(tx as any, {
      ventaId: 7,
      canteraId: 2,
      materialId: 5,
      m3: 12.5,
      capturedAt,
    });

    // La fila se crea con asignado 0: el despacho ocurrió y tiene que verse,
    // aunque nadie haya cargado stock todavía.
    expect(tx.ventaCanteraStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { canteraId: 2, materialId: 5, m3Asignados: 0 },
      }),
    );
    expect(movimiento).toMatchObject({ tipo: 'SALIDA', m3: 12.5, ventaId: 7 });
  });

  it('usa el capturedAt de la venta, no la hora de sincronización', async () => {
    const tx = crearTx();
    const capturedAt = new Date('2026-09-01T08:30:00.000Z');

    await crearServicio().registrarSalida(tx as any, {
      ventaId: 7,
      canteraId: 2,
      materialId: 5,
      m3: 10,
      capturedAt,
    });

    expect(tx.ventaStockMovimiento.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ capturedAt }) }),
    );
  });

  it('es idempotente: hace upsert por ventaId con update vacío', async () => {
    const tx = crearTx();

    await crearServicio().registrarSalida(tx as any, {
      ventaId: 7,
      canteraId: 2,
      materialId: 5,
      m3: 10,
      capturedAt: new Date(),
    });

    // El UNIQUE de ventaId impide el doble descuento; el update vacío evita que
    // un reenvío pise el movimiento ya registrado.
    expect(tx.ventaStockMovimiento.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ventaId: 7 }, update: {} }),
    );
  });

  it('ignora cantidades no válidas sin tocar el stock', async () => {
    const tx = crearTx();

    const resultado = await crearServicio().registrarSalida(tx as any, {
      ventaId: 7,
      canteraId: 2,
      materialId: 5,
      m3: 0,
      capturedAt: new Date(),
    });

    expect(resultado).toBeNull();
    expect(tx.ventaCanteraStock.upsert).not.toHaveBeenCalled();
    expect(tx.ventaStockMovimiento.upsert).not.toHaveBeenCalled();
  });
});

describe('VentasStockService.ajustarSalida', () => {
  it('edita el renglón en vez de crear un contra-asiento', async () => {
    const tx = crearTx();

    await crearServicio().ajustarSalida(tx as any, 7, 8.25);

    expect(tx.ventaStockMovimiento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: expect.objectContaining({ m3: 8.25, tipo: 'AJUSTE' }),
      }),
    );
  });

  it('no falla si la venta no tenía movimiento de stock', async () => {
    const tx = crearTx();
    tx.ventaStockMovimiento.findUnique.mockResolvedValue(null);

    const resultado = await crearServicio().ajustarSalida(tx as any, 7, 8);

    expect(resultado).toBeNull();
    expect(tx.ventaStockMovimiento.update).not.toHaveBeenCalled();
  });
});

describe('VentasStockService.revertirSalida', () => {
  it('marca el movimiento como REVERSA para devolver los m3 al saldo', async () => {
    const tx = crearTx();

    await crearServicio().revertirSalida(tx as any, 7);

    expect(tx.ventaStockMovimiento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'REVERSA' }),
      }),
    );
  });
});

describe('VentasStockService.getSaldo', () => {
  const conMovimientos = (
    movimientos: { m3: number; tipo: string; ventaId?: number | null }[],
  ) => ({
    ventaCanteraStock: {
      findUnique: jest.fn().mockResolvedValue({
        id: 10,
        canteraId: 2,
        materialId: 5,
        m3Asignados: 100,
        isActive: true,
        material: { id: 5, materialType: 'ARENA_DE_BANCO' },
        movimientos,
      }),
    },
  });

  it('resta las salidas del asignado', async () => {
    const prisma = conMovimientos([
      { m3: 20, tipo: 'SALIDA', ventaId: 1 },
      { m3: 30, tipo: 'SALIDA', ventaId: 2 },
    ]);

    const saldo = await crearServicio(prisma).getSaldo(2, 5);

    expect(saldo).toMatchObject({
      asignadoM3: 100,
      consumidoM3: 50,
      disponibleM3: 50,
      excedido: false,
    });
  });

  it('cuenta los AJUSTE como consumo y no cuenta las REVERSA', async () => {
    const prisma = conMovimientos([
      { m3: 20, tipo: 'SALIDA', ventaId: 1 },
      { m3: 15, tipo: 'AJUSTE', ventaId: 2 },
      { m3: 40, tipo: 'REVERSA', ventaId: 3 },
    ]);

    const saldo = await crearServicio(prisma).getSaldo(2, 5);

    // La REVERSA devolvió sus m3 al saldo, así que no suma al consumo.
    expect(saldo?.consumidoM3).toBe(35);
    expect(saldo?.disponibleM3).toBe(65);
  });

  it('no vuelve a contar los INGRESO: ya están dentro del asignado', async () => {
    const prisma = conMovimientos([
      { m3: 100, tipo: 'INGRESO' },
      { m3: 10, tipo: 'SALIDA', ventaId: 1 },
    ]);

    const saldo = await crearServicio(prisma).getSaldo(2, 5);

    expect(saldo?.consumidoM3).toBe(10);
    expect(saldo?.disponibleM3).toBe(90);
  });

  it('marca excedido cuando se vendió más de lo asignado', async () => {
    const prisma = conMovimientos([{ m3: 130, tipo: 'SALIDA', ventaId: 1 }]);

    const saldo = await crearServicio(prisma).getSaldo(2, 5);

    // No es un error del sistema: con la app offline la venta ya ocurrió.
    expect(saldo).toMatchObject({ disponibleM3: -30, excedido: true });
  });

  it('devuelve null si la cantera no tiene ese material', async () => {
    const prisma = {
      ventaCanteraStock: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    expect(await crearServicio(prisma).getSaldo(2, 5)).toBeNull();
  });

  it('NO cuenta como consumo el AJUSTE manual del asignado', async () => {
    // Un ajuste manual no tiene ventaId. Contarlo restaba dos veces: bajaba el
    // disponible además de haber movido ya el asignado.
    const prisma = conMovimientos([
      { m3: 100, tipo: 'INGRESO' },
      { m3: -30, tipo: 'AJUSTE', ventaId: null },
      { m3: 10, tipo: 'SALIDA', ventaId: 1 },
    ]);

    const saldo = await crearServicio(prisma).getSaldo(2, 5);

    expect(saldo?.consumidoM3).toBe(10);
    expect(saldo?.disponibleM3).toBe(90);
  });
});
