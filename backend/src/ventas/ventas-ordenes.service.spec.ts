import { VentasOrdenesService } from './ventas-ordenes.service';
import { BusinessException } from '../common/business.exception';

/**
 * Reglas de las órdenes de venta.
 *
 * Se instancia el servicio a mano con un Prisma mockeado, igual que
 * ventas.service.spec.ts y ventas-stock.service.spec.ts: no hace falta el
 * contenedor de DI ni una base de datos.
 */

const crearServicio = (prisma: any) =>
  new VentasOrdenesService(prisma, {
    notifyNuevaOrden: jest.fn().mockResolvedValue(undefined),
  } as any);

// ─── resolverOrdenItem ────────────────────────────────────────────────────────

describe('VentasOrdenesService.resolverOrdenItem', () => {
  const crearTx = (overrides: Record<string, any> = {}) => ({
    $queryRaw: jest.fn().mockResolvedValue([
      {
        id: 77,
        materialId: 55,
        m3Asignados: 100,
        ordenId: 9,
        alertaBajoStockEnviada: false,
      },
    ]),
    ventaOrden: {
      findUnique: jest.fn().mockResolvedValue({
        id: 9,
        estado: 'ABIERTA',
        isActive: true,
        constSiteId: 20,
      }),
    },
    ventaCantera: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { m3: 30 } }),
    },
    ventaOrdenItem: {
      update: jest.fn(),
    },
    ...overrides,
  });

  it('resuelve ordenId, constSiteId y materialId cuando hay cupo', async () => {
    const tx = crearTx();

    const resultado = await crearServicio({}).resolverOrdenItem(
      tx as any,
      77,
      20,
    );

    expect(resultado).toEqual({ ordenId: 9, constSiteId: 20, materialId: 55 });
  });

  it('bloquea la fila del ítem con FOR UPDATE antes de leer el saldo', async () => {
    const tx = crearTx();

    await crearServicio({}).resolverOrdenItem(tx as any, 77, 20);

    // El bloqueo tiene que ser lo primero: si se leyera el saldo antes de
    // bloquear, dos despachos simultáneos podrían leer el mismo disponible.
    expect(tx.$queryRaw).toHaveBeenCalled();
    const sql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toMatch(/FOR UPDATE/i);
  });

  it('rechaza sin reintento una línea inexistente', async () => {
    const tx = crearTx({ $queryRaw: jest.fn().mockResolvedValue([]) });

    await expect(
      crearServicio({}).resolverOrdenItem(tx as any, 999, 10),
    ).rejects.toMatchObject({ code: 'ORDEN_ITEM_NOT_FOUND', retryable: false });
  });

  it('rechaza una orden que ya no está ABIERTA (cerrada, cancelada o completada)', async () => {
    const tx = crearTx({
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          estado: 'CERRADA',
          isActive: true,
          constSiteId: 20,
        }),
      },
    });

    await expect(
      crearServicio({}).resolverOrdenItem(tx as any, 77, 10),
    ).rejects.toMatchObject({ code: 'ORDEN_NO_ABIERTA' });
  });

  it('rechaza una orden dada de baja', async () => {
    const tx = crearTx({
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          estado: 'ABIERTA',
          isActive: false,
          constSiteId: 20,
        }),
      },
    });

    await expect(
      crearServicio({}).resolverOrdenItem(tx as any, 77, 10),
    ).rejects.toMatchObject({ code: 'ORDEN_NOT_FOUND' });
  });

  it('rechaza un despacho que excede el disponible: 100 asignados, 30 despachados, pide 71', async () => {
    const tx = crearTx();

    await expect(
      crearServicio({}).resolverOrdenItem(tx as any, 77, 71),
    ).rejects.toMatchObject({ code: 'ORDEN_SIN_CUPO', retryable: false });
  });

  it('acepta un despacho por exactamente lo que queda disponible: el último m³', async () => {
    const tx = crearTx();

    // 100 asignados - 30 ya despachados = 70 disponibles.
    const resultado = await crearServicio({}).resolverOrdenItem(
      tx as any,
      77,
      70,
    );

    expect(resultado.ordenId).toBe(9);
  });

  it('solo cuenta ventas activas al sumar lo despachado', async () => {
    const tx = crearTx();

    await crearServicio({}).resolverOrdenItem(tx as any, 77, 10);

    expect(tx.ventaCantera.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ordenItemId: 77, isActive: true },
      }),
    );
  });

  it('marca la alerta de bajo stock si el despacho deja 5 m³ o menos y todavía no se avisó', async () => {
    const tx = crearTx();

    // 100 asignados - 30 despachados = 70 disponibles; pide 66 -> quedan 4.
    const resultado = await crearServicio({}).resolverOrdenItem(
      tx as any,
      77,
      66,
    );

    expect(tx.ventaOrdenItem.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: { alertaBajoStockEnviada: true },
    });
    expect(resultado.avisoBajoStockOrdenItemId).toBe(77);
  });

  it('no vuelve a marcar ni a avisar si esa línea ya tenía la alerta enviada', async () => {
    const tx = crearTx({
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 77,
          materialId: 55,
          m3Asignados: 100,
          ordenId: 9,
          alertaBajoStockEnviada: true,
        },
      ]),
    });

    const resultado = await crearServicio({}).resolverOrdenItem(
      tx as any,
      77,
      66,
    );

    expect(tx.ventaOrdenItem.update).not.toHaveBeenCalled();
    expect(resultado.avisoBajoStockOrdenItemId).toBeUndefined();
  });

  it('no avisa si al despachar queda bastante disponible todavía', async () => {
    const tx = crearTx();

    // 70 disponibles, pide 20 -> quedan 50, muy por encima del umbral.
    const resultado = await crearServicio({}).resolverOrdenItem(
      tx as any,
      77,
      20,
    );

    expect(tx.ventaOrdenItem.update).not.toHaveBeenCalled();
    expect(resultado.avisoBajoStockOrdenItemId).toBeUndefined();
  });
});

// ─── recalcularEstadoOrden ──────────────────────────────────────────────────

describe('VentasOrdenesService.recalcularEstadoOrden', () => {
  it('deja la orden ABIERTA si al menos una línea todavía tiene saldo', async () => {
    const tx = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ estado: 'ABIERTA' }),
        update: jest.fn(),
      },
      ventaOrdenItem: {
        findMany: jest.fn().mockResolvedValue([
          { m3Asignados: 100, ventas: [{ m3: 100 }] }, // agotada
          { m3Asignados: 50, ventas: [{ m3: 20 }] }, // con saldo
        ]),
      },
    };

    await crearServicio({}).recalcularEstadoOrden(tx as any, 9);

    expect(tx.ventaOrden.update).not.toHaveBeenCalled();
  });

  it('pasa a COMPLETADA cuando todas las líneas llegan a su tope', async () => {
    const tx = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ estado: 'ABIERTA' }),
        update: jest.fn(),
      },
      ventaOrdenItem: {
        findMany: jest.fn().mockResolvedValue([
          { m3Asignados: 100, ventas: [{ m3: 60 }, { m3: 40 }] },
          { m3Asignados: 50, ventas: [{ m3: 50 }] },
        ]),
      },
    };

    await crearServicio({}).recalcularEstadoOrden(tx as any, 9);

    expect(tx.ventaOrden.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { estado: 'COMPLETADA' },
    });
  });

  it('vuelve a ABIERTA si una COMPLETADA deja de estarlo (venta anulada)', async () => {
    const tx = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ estado: 'COMPLETADA' }),
        update: jest.fn(),
      },
      ventaOrdenItem: {
        findMany: jest.fn().mockResolvedValue([
          { m3Asignados: 100, ventas: [] }, // la venta que la completaba se anuló
        ]),
      },
    };

    await crearServicio({}).recalcularEstadoOrden(tx as any, 9);

    expect(tx.ventaOrden.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { estado: 'ABIERTA' },
    });
  });

  it('NO reabre una orden que un ADMIN cerró a mano', async () => {
    const tx = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ estado: 'CERRADA' }),
        update: jest.fn(),
      },
      ventaOrdenItem: { findMany: jest.fn() },
    };

    await crearServicio({}).recalcularEstadoOrden(tx as any, 9);

    expect(tx.ventaOrdenItem.findMany).not.toHaveBeenCalled();
    expect(tx.ventaOrden.update).not.toHaveBeenCalled();
  });

  it('NO reactiva una orden CANCELADA', async () => {
    const tx = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ estado: 'CANCELADA' }),
        update: jest.fn(),
      },
      ventaOrdenItem: { findMany: jest.fn() },
    };

    await crearServicio({}).recalcularEstadoOrden(tx as any, 9);

    expect(tx.ventaOrden.update).not.toHaveBeenCalled();
  });

  it('una orden sin líneas nunca se da por completada sola', async () => {
    const tx = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ estado: 'ABIERTA' }),
        update: jest.fn(),
      },
      ventaOrdenItem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await crearServicio({}).recalcularEstadoOrden(tx as any, 9);

    expect(tx.ventaOrden.update).not.toHaveBeenCalled();
  });

  it('no hace nada si la orden ya no existe', async () => {
    const tx = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      ventaOrdenItem: { findMany: jest.fn() },
    };

    await crearServicio({}).recalcularEstadoOrden(tx as any, 999);

    expect(tx.ventaOrdenItem.findMany).not.toHaveBeenCalled();
  });
});

// ─── create ─────────────────────────────────────────────────────────────────

describe('VentasOrdenesService.create', () => {
  const crearPrisma = (overrides: Record<string, any> = {}) => {
    const prisma: any = {
      client: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          isActive: true,
          companyname: 'CONSTRUCTORA XYZ S.A.',
        }),
      },
      constSite: {
        findUnique: jest.fn().mockResolvedValue({
          id: 20,
          isActive: true,
          name: 'Obra Norte',
        }),
      },
      clientConstSite: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 1, clientId: 4, constSiteId: 20 }),
      },
      material: {
        // Filtra de verdad según el `where.id.in`, si no cualquier consulta
        // devuelve los dos materiales del catálogo y desajusta el conteo que
        // usa validarMateriales para detectar faltantes.
        findMany: jest
          .fn()
          .mockImplementation(async ({ where }: any) =>
            [{ id: 5 }, { id: 6 }].filter((m) => where.id.in.includes(m.id)),
          ),
      },
      ventaOrdenSequence: {
        upsert: jest.fn().mockResolvedValue({ year: 2026, last: 1 }),
      },
      ventaOrden: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 9,
          ...data,
          items: (data.items?.create ?? []).map((i: any, idx: number) => ({
            id: idx + 1,
            ...i,
            material: { id: i.materialId, materialType: 'ARENA_DE_BANCO' },
            ventas: [],
          })),
        })),
      },
      ...overrides,
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    return prisma;
  };

  const datosOrden = (extra: Record<string, any> = {}) => ({
    clientId: 4,
    constSiteId: 20,
    empresaVendedora: 'DISTRASA',
    observacion: undefined,
    items: [{ materialId: 5, m3Asignados: 100 }],
    ...extra,
  });

  it('genera el código ORD-0001-2026 y crea la orden con sus líneas', async () => {
    const prisma = crearPrisma();

    const orden = await crearServicio(prisma).create(datosOrden() as any);

    expect(orden.codigo).toBe('ORD-0001-2026');
    expect(prisma.ventaOrden.create).toHaveBeenCalled();
  });

  it('guarda la empresa vendedora elegida y la devuelve en la orden', async () => {
    const prisma = crearPrisma();

    const orden = await crearServicio(prisma).create(datosOrden() as any);

    expect(
      prisma.ventaOrden.create.mock.calls[0][0].data.empresaVendedora,
    ).toBe('DISTRASA');
    expect(orden.empresaVendedora).toBe('DISTRASA');
  });

  it('sin transportista guarda null (es opcional)', async () => {
    const prisma = crearPrisma();

    await crearServicio(prisma).create(datosOrden() as any);

    expect(
      prisma.ventaOrden.create.mock.calls[0][0].data.transportistaId,
    ).toBeNull();
  });

  it('guarda el transportista elegido', async () => {
    const prisma = crearPrisma({
      transportista: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
    });

    await crearServicio(prisma).create(
      datosOrden({ transportistaId: 3 }) as any,
    );

    expect(prisma.ventaOrden.create.mock.calls[0][0].data.transportistaId).toBe(
      3,
    );
  });

  it('rechaza un transportista que no existe', async () => {
    const prisma = crearPrisma({
      transportista: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      crearServicio(prisma).create(datosOrden({ transportistaId: 99 }) as any),
    ).rejects.toThrow('EL TRANSPORTISTA NO EXISTE');
    expect(prisma.ventaOrden.create).not.toHaveBeenCalled();
  });

  it('rechaza si el cliente no existe', async () => {
    const prisma = crearPrisma({
      client: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      crearServicio(prisma).create(datosOrden() as any),
    ).rejects.toThrow('EL CLIENTE NO EXISTE');
  });

  it('rechaza si el cliente está dado de baja', async () => {
    const prisma = crearPrisma({
      client: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          isActive: false,
          companyname: 'CONSTRUCTORA XYZ S.A.',
        }),
      },
    });

    await expect(
      crearServicio(prisma).create(datosOrden() as any),
    ).rejects.toMatchObject({ code: 'CLIENTE_INACTIVO' });
  });

  it('rechaza si la obra no pertenece a ese cliente', async () => {
    const prisma = crearPrisma({
      clientConstSite: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      crearServicio(prisma).create(datosOrden() as any),
    ).rejects.toMatchObject({ code: 'OBRA_SIN_CLIENTE' });
  });

  it('rechaza materiales repetidos en la misma orden', async () => {
    const prisma = crearPrisma();

    await expect(
      crearServicio(prisma).create(
        datosOrden({
          items: [
            { materialId: 5, m3Asignados: 100 },
            { materialId: 5, m3Asignados: 50 },
          ],
        }) as any,
      ),
    ).rejects.toMatchObject({ code: 'MATERIAL_REPETIDO' });
  });

  it('rechaza un material que no existe en el catálogo', async () => {
    const prisma = crearPrisma({
      material: { findMany: jest.fn().mockResolvedValue([]) },
    });

    await expect(
      crearServicio(prisma).create(datosOrden() as any),
    ).rejects.toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
  });
});

// ─── update (syncItems) ─────────────────────────────────────────────────────

describe('VentasOrdenesService.update', () => {
  const crearPrisma = (overrides: Record<string, any> = {}) => {
    const prisma: any = {
      ventaOrden: {
        // Sirve para las tres lecturas de esta orden: la comprobación de
        // existencia, la que hace recalcularEstadoOrden (solo lee `estado`) y
        // el re-fetch final con ORDEN_INCLUDE que arma la respuesta — por eso
        // trae `items: []` también, para que formatOrden no reviente.
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 9, estado: 'ABIERTA', items: [] }),
        update: jest.fn().mockResolvedValue({}),
      },
      ventaOrdenItem: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      material: {
        findMany: jest.fn().mockImplementation(async ({ where }: any) =>
          [
            { id: 5, materialType: 'SUB_BASE' },
            { id: 6, materialType: 'RIPIO' },
          ].filter((m) => where.id.in.includes(m.id)),
        ),
      },
      ...overrides,
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    return prisma;
  };

  it('no se puede quitar una línea que ya tiene despachos activos', async () => {
    const prisma = crearPrisma({
      ventaOrdenItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1, materialId: 5, ventas: [{ id: 100 }] }]),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    });

    // El nuevo set de líneas ya no incluye el materialId 5.
    await expect(
      crearServicio(prisma).update(
        9,
        { items: [{ materialId: 6, m3Asignados: 10 }] } as any,
        1,
      ),
    ).rejects.toMatchObject({ code: 'ITEM_CON_DESPACHOS' });

    expect(prisma.ventaOrdenItem.delete).not.toHaveBeenCalled();
  });

  it('sí se puede quitar una línea sin despachos', async () => {
    const prisma = crearPrisma({
      ventaOrdenItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1, materialId: 5, ventas: [] }]),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    });

    await crearServicio(prisma).update(
      9,
      { items: [{ materialId: 6, m3Asignados: 10 }] } as any,
      1,
    );

    expect(prisma.ventaOrdenItem.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it('falla si la orden no existe', async () => {
    const prisma = crearPrisma({
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    });

    await expect(
      crearServicio(prisma).update(999, {} as any, 1),
    ).rejects.toThrow('LA ORDEN NO EXISTE');
  });

  it('marca quién editó la orden y cuándo, en toda edición', async () => {
    const prisma = crearPrisma();

    await crearServicio(prisma).update(9, { observacion: 'ok' } as any, 7);

    expect(prisma.ventaOrden.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        data: expect.objectContaining({
          editadoPorId: 7,
          editadoEn: expect.any(Date),
        }),
      }),
    );
  });

  it('guarda el material tocado cuando cambian las líneas', async () => {
    const prisma = crearPrisma({
      ventaOrdenItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 1, materialId: 5, m3Asignados: 10, ventas: [] },
          ]),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    });

    // materialId 5 cambia de m3Asignados y materialId 6 es nuevo.
    await crearServicio(prisma).update(
      9,
      {
        items: [
          { materialId: 5, m3Asignados: 20 },
          { materialId: 6, m3Asignados: 15 },
        ],
      } as any,
      7,
    );

    expect(prisma.ventaOrden.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          editadoMaterial: 'SUB_BASE,RIPIO',
        }),
      }),
    );
  });

  it('no marca ningún material si la edición solo cambia la observación', async () => {
    const prisma = crearPrisma();

    await crearServicio(prisma).update(9, { observacion: 'ok' } as any, 7);

    expect(prisma.ventaOrden.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ editadoMaterial: null }),
      }),
    );
  });
});

// ─── cerrar ─────────────────────────────────────────────────────────────────

describe('VentasOrdenesService.cerrar', () => {
  it('cierra una orden ABIERTA con motivo', async () => {
    const prisma: any = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ id: 9, estado: 'ABIERTA' }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 9, estado: 'CERRADA', items: [] }),
      },
    };

    await crearServicio(prisma).cerrar(9, 3, 'El cliente ya no la necesita');

    expect(prisma.ventaOrden.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'CERRADA',
          cerradaPorId: 3,
          motivoCierre: 'El cliente ya no la necesita',
        }),
      }),
    );
  });

  it('rechaza cerrar una orden que ya está cerrada', async () => {
    const prisma: any = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ id: 9, estado: 'CERRADA' }),
        update: jest.fn(),
      },
    };

    await expect(
      crearServicio(prisma).cerrar(9, 3, 'motivo'),
    ).rejects.toMatchObject({
      code: 'ORDEN_YA_CERRADA',
    });
    expect(prisma.ventaOrden.update).not.toHaveBeenCalled();
  });
});

// ─── remove ─────────────────────────────────────────────────────────────────

describe('VentasOrdenesService.remove', () => {
  it('da de baja una orden sin despachos', async () => {
    const prisma: any = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ id: 9 }),
        update: jest.fn().mockResolvedValue({ id: 9, isActive: false }),
      },
      ventaCantera: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await crearServicio(prisma).remove(9);

    expect(prisma.ventaOrden.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { isActive: false },
    });
  });

  it('rechaza eliminar una orden que ya tiene despachos', async () => {
    const prisma: any = {
      ventaOrden: {
        findUnique: jest.fn().mockResolvedValue({ id: 9 }),
        update: jest.fn(),
      },
      ventaCantera: { findFirst: jest.fn().mockResolvedValue({ id: 501 }) },
    };

    await expect(crearServicio(prisma).remove(9)).rejects.toMatchObject({
      code: 'ORDEN_CON_DESPACHOS',
    });
    expect(prisma.ventaOrden.update).not.toHaveBeenCalled();
  });
});

// ─── getAbiertas ────────────────────────────────────────────────────────────

describe('VentasOrdenesService.getAbiertas', () => {
  it('agrupa cliente -> obra -> orden y oculta las líneas sin saldo', async () => {
    const prisma: any = {
      ventaOrden: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            codigo: 'ORD-0001-2026',
            clientId: 4,
            constSiteId: 20,
            client: {
              id: 4,
              name: 'X',
              companyname: 'CONSTRUCTORA XYZ S.A.',
              type: 'PUBLICO',
            },
            constSite: { id: 20, name: 'Obra Norte' },
            transportista: { id: 3, name: 'TRANSPORTES X' },
            items: [
              {
                id: 1,
                materialId: 5,
                m3Asignados: 100,
                material: { id: 5, materialType: 'ARENA_DE_BANCO' },
                ventas: [{ m3: 100 }], // agotada, no debe aparecer
              },
              {
                id: 2,
                materialId: 6,
                m3Asignados: 50,
                material: { id: 6, materialType: 'RIPIO' },
                ventas: [{ m3: 10 }], // con saldo, sí debe aparecer
              },
            ],
          },
        ]),
      },
    };

    const catalogo = await crearServicio(prisma).getAbiertas();

    expect(catalogo).toHaveLength(1);
    expect(catalogo[0].obras).toHaveLength(1);
    expect(catalogo[0].obras[0].ordenes).toHaveLength(1);
    const items = catalogo[0].obras[0].ordenes[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].materialId).toBe(6);
    expect(catalogo[0].obras[0].ordenes[0].transportista).toEqual({
      id: 3,
      name: 'TRANSPORTES X',
    });
  });

  it('una orden sin transportista lo devuelve en null', async () => {
    const prisma: any = {
      ventaOrden: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            codigo: 'ORD-0001-2026',
            clientId: 4,
            constSiteId: 20,
            client: { id: 4, name: 'X', companyname: 'X', type: 'PUBLICO' },
            constSite: { id: 20, name: 'Obra Norte' },
            items: [
              {
                id: 2,
                materialId: 6,
                m3Asignados: 50,
                material: { id: 6, materialType: 'RIPIO' },
                ventas: [],
              },
            ],
          },
        ]),
      },
    };

    const catalogo = await crearServicio(prisma).getAbiertas();

    expect(catalogo[0].obras[0].ordenes[0].transportista).toBeNull();
  });

  it('una orden con todas sus líneas agotadas no aparece', async () => {
    const prisma: any = {
      ventaOrden: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            codigo: 'ORD-0001-2026',
            clientId: 4,
            constSiteId: 20,
            client: { id: 4, name: 'X', companyname: 'X', type: 'PUBLICO' },
            constSite: { id: 20, name: 'Obra Norte' },
            items: [
              {
                id: 1,
                materialId: 5,
                m3Asignados: 100,
                material: { id: 5, materialType: 'ARENA_DE_BANCO' },
                ventas: [{ m3: 100 }],
              },
            ],
          },
        ]),
      },
    };

    const catalogo = await crearServicio(prisma).getAbiertas();

    expect(catalogo).toHaveLength(0);
  });
});

// ─── vehículos de la orden ─────────────────────────────────────────────────

describe('VentasOrdenesService — vehículos de la orden', () => {
  const crearPrisma = (overrides: Record<string, any> = {}) => {
    const prisma: any = {
      client: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          isActive: true,
          ruc: '0990000000001',
          companyname: 'CONSTRUCTORA XYZ S.A.',
          type: 'PUBLICO',
        }),
      },
      constSite: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 20, isActive: true, name: 'Obra' }),
      },
      clientConstSite: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
      material: {
        findMany: jest.fn().mockResolvedValue([{ id: 5 }]),
      },
      vehicle: {
        findMany: jest
          .fn()
          .mockImplementation(async ({ where }: any) =>
            [{ id: 70 }, { id: 71 }].filter((v) => where.id.in.includes(v.id)),
          ),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 99,
          ...data,
        })),
      },
      vehicleSequence: {
        findUnique: jest.fn().mockResolvedValue({ prefix: 'TE', last: 4 }),
        update: jest.fn().mockResolvedValue({ prefix: 'TE', last: 5 }),
      },
      owner: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 30 }),
      },
      ventaOrdenSequence: {
        upsert: jest.fn().mockResolvedValue({ year: 2026, last: 1 }),
      },
      ventaOrden: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 9,
          ...data,
          items: [],
          vehiculos: [],
        })),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 9, estado: 'ABIERTA', items: [] }),
        update: jest.fn().mockResolvedValue({}),
      },
      ventaOrdenVehiculo: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      ventaOrdenItem: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    return prisma;
  };

  it('create guarda los vehículos asignados', async () => {
    const prisma = crearPrisma();

    await crearServicio(prisma).create({
      clientId: 4,
      constSiteId: 20,
      items: [{ materialId: 5, m3Asignados: 10 }],
      vehicleIds: [70, 71, 70],
    } as any);

    const { data } = prisma.ventaOrden.create.mock.calls[0][0];
    expect(data.vehiculos).toEqual({
      create: [{ vehicleId: 70 }, { vehicleId: 71 }],
    });
  });

  it('create rechaza un vehículo que no existe', async () => {
    const prisma = crearPrisma();

    await expect(
      crearServicio(prisma).create({
        clientId: 4,
        constSiteId: 20,
        items: [{ materialId: 5, m3Asignados: 10 }],
        vehicleIds: [70, 555],
      } as any),
    ).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
  });

  it('update sincroniza la lista: quita los que sobran y agrega los nuevos', async () => {
    const prisma = crearPrisma();

    await crearServicio(prisma).update(9, { vehicleIds: [71] } as any, 1);

    expect(prisma.ventaOrdenVehiculo.deleteMany).toHaveBeenCalledWith({
      where: { ordenId: 9, vehicleId: { notIn: [71] } },
    });
    expect(prisma.ventaOrdenVehiculo.createMany).toHaveBeenCalledWith({
      data: [{ ordenId: 9, vehicleId: 71 }],
      skipDuplicates: true,
    });
  });

  it('update sin vehicleIds no toca los vehículos', async () => {
    const prisma = crearPrisma();

    await crearServicio(prisma).update(9, { observacion: 'ok' } as any, 1);

    expect(prisma.ventaOrdenVehiculo.deleteMany).not.toHaveBeenCalled();
  });

  describe('resolverVehiculo', () => {
    it('si la placa ya existe devuelve ese vehículo sin crear nada', async () => {
      const prisma = crearPrisma();
      prisma.vehicle.findUnique.mockResolvedValue({ id: 70, plate: 'ABC1234' });

      const v = await crearServicio(prisma).resolverVehiculo({
        clientId: 4,
        plate: 'abc-1234',
        capacity: 14,
      } as any);

      expect(v.id).toBe(70);
      expect(prisma.vehicle.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { plate: 'ABC1234' } }),
      );
      expect(prisma.vehicle.create).not.toHaveBeenCalled();
    });

    it('cliente público: crea un externo TE- con su proveedor (creándolo si falta)', async () => {
      const prisma = crearPrisma();

      await crearServicio(prisma).resolverVehiculo({
        clientId: 4,
        plate: 'PBX-0123',
        capacity: 14,
      } as any);

      expect(prisma.owner.create).toHaveBeenCalledWith({
        data: { ruc: '0990000000001', companyname: 'CONSTRUCTORA XYZ S.A.' },
      });
      const { data } = prisma.vehicle.create.mock.calls[0][0];
      expect(data).toMatchObject({
        vehicleid: 'TE-00005',
        plate: 'PBX0123',
        capacity: 14,
        type: 'EXTERNO',
        ownerId: 30,
      });
    });

    it('cliente privado: exige ID y empresa', async () => {
      const prisma = crearPrisma();
      prisma.client.findUnique.mockResolvedValue({
        id: 4,
        ruc: '1',
        companyname: 'X',
        type: 'PRIVADO',
      });

      await expect(
        crearServicio(prisma).resolverVehiculo({
          clientId: 4,
          plate: 'PBX0123',
          capacity: 14,
        } as any),
      ).rejects.toMatchObject({ code: 'DATOS_VEHICULO_INTERNO' });
    });

    it('cliente privado: crea un interno con el ID y la empresa indicados', async () => {
      const prisma = crearPrisma();
      prisma.client.findUnique.mockResolvedValue({
        id: 4,
        ruc: '1',
        companyname: 'X',
        type: 'PRIVADO',
      });

      await crearServicio(prisma).resolverVehiculo({
        clientId: 4,
        plate: 'PBX0123',
        capacity: 14,
        vehicleid: 'tcr-02-99',
        company: 'CIUDAD_RODRIGO',
      } as any);

      const { data } = prisma.vehicle.create.mock.calls[0][0];
      expect(data).toMatchObject({
        vehicleid: 'TCR-02-99',
        type: 'INTERNO',
        company: 'CIUDAD_RODRIGO',
      });
      expect(prisma.owner.create).not.toHaveBeenCalled();
    });

    it('acepta placas de 3 números (ej. SBD258)', async () => {
      const prisma = crearPrisma();

      await crearServicio(prisma).resolverVehiculo({
        clientId: 4,
        plate: 'sbd-258',
        capacity: 21,
      } as any);

      expect(prisma.vehicle.create.mock.calls[0][0].data.plate).toBe('SBD258');
    });

    it.each(['12-ABCD', 'PBX-01', 'AB-1234', 'PBX-01234'])(
      'rechaza la placa %s: deben ser 3 letras y 3 o 4 números',
      async (plate) => {
        const prisma = crearPrisma();

        await expect(
          crearServicio(prisma).resolverVehiculo({
            clientId: 4,
            plate,
            capacity: 14,
          } as any),
        ).rejects.toMatchObject({ code: 'PLACA_INVALIDA' });
        expect(prisma.vehicle.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('buscarVehiculoPorPlaca', () => {
    it('devuelve el vehículo registrado con su cubicaje real', async () => {
      const prisma = crearPrisma();
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 70,
        plate: 'PBX0123',
        capacity: 12,
      });

      const v = await crearServicio(prisma).buscarVehiculoPorPlaca('pbx-0123');

      expect(v?.capacity).toBe(12);
      expect(prisma.vehicle.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { plate: 'PBX0123' } }),
      );
    });

    it('devuelve null si la placa no está registrada', async () => {
      const prisma = crearPrisma();

      await expect(
        crearServicio(prisma).buscarVehiculoPorPlaca('PBX-0123'),
      ).resolves.toBeNull();
    });
  });
});
