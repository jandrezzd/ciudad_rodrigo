import { TransportLogService } from './transport-log.service';
import { CanteraStockService } from './cantera-stock.service';

/**
 * Corrección del material de un viaje ya registrado.
 *
 * Lo que se cuida acá no es el `update` del trip —eso es trivial— sino que el
 * consumo de la cantera se mueva con él. Si el renglón del libro mayor se
 * quedara colgando del material anterior, el reporte de materiales diría una
 * cosa y el de stock otra, sin que nada falle a la vista.
 *
 * Se usa el CanteraStockService REAL (con un cliente de transacción mockeado)
 * para ejercitar la reubicación de verdad, no una simulación de ella.
 */

type Trip = { id: number; materialId: number | null; canteraId: number | null };

const crearMocks = (opciones: {
  trip?: Trip;
  /** Pares (cantera, material) que la cantera declara, con su factor. */
  canteraMateriales?: Array<{
    id: number;
    canteraId: number;
    materialId: number;
    factor: number | null;
    direccionConversion: string;
  }>;
  /** Movimiento de stock ya existente para el viaje. */
  movimiento?: { tripId: number; canteraMaterialId: number; m3: number } | null;
  rolUsuario?: string;
} = {}) => {
  const trip = opciones.trip ?? { id: 1, materialId: 11, canteraId: 1 };
  const canteraMateriales = opciones.canteraMateriales ?? [
    { id: 1, canteraId: 1, materialId: 11, factor: 1.5, direccionConversion: 'TN_A_M3' },
    { id: 2, canteraId: 1, materialId: 3, factor: 2, direccionConversion: 'TN_A_M3' },
  ];
  const movimiento =
    opciones.movimiento === undefined
      ? { tripId: trip.id, canteraMaterialId: 1, m3: 20 }
      : opciones.movimiento;

  const tx = {
    canteraMaterialMovimiento: {
      findUnique: jest.fn().mockResolvedValue(movimiento),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        ...movimiento,
        ...data,
      })),
    },
    canteraMaterial: {
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
        const { canteraId, materialId } = where.canteraId_materialId;
        return (
          canteraMateriales.find(
            (cm) => cm.canteraId === canteraId && cm.materialId === materialId,
          ) ?? null
        );
      }),
    },
    transportTrip: {
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        ...trip,
        ...data,
      })),
    },
  };

  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 1, role: opciones.rolUsuario ?? 'ADMIN' }),
    },
    transportTrip: {
      findUnique: jest.fn().mockResolvedValue(trip),
    },
    material: {
      findUnique: jest
        .fn()
        .mockImplementation(async ({ where }: any) =>
          where.id === 99 ? null : { id: where.id, materialType: 'ARENA_FINA' },
        ),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };

  const servicio = new TransportLogService(
    prisma as any,
    {} as any,
    new CanteraStockService(prisma as any),
    {} as any,
  );

  return { servicio, prisma, tx };
};

describe('TransportLogService.updateMaterial', () => {
  it('cambia el material del viaje', async () => {
    const { servicio, tx } = crearMocks();

    const resultado = await servicio.updateMaterial(1, 3, 1);

    expect(tx.transportTrip.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { materialId: 3 } }),
    );
    expect(resultado.success).toBe(true);
  });

  it('mueve el consumo de la cantera al material nuevo', async () => {
    const { servicio, tx } = crearMocks();

    await servicio.updateMaterial(1, 3, 1);

    expect(tx.canteraMaterialMovimiento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: 1 },
        data: expect.objectContaining({ canteraMaterialId: 2 }),
      }),
    );
  });

  it('recalcula la conversión con el factor del material nuevo, no arrastra la anterior', async () => {
    // 20 m³ con factor 2 del material destino = 40 TN. Con el factor 1.5 del
    // material anterior habrían quedado 30 TN, que no corresponden a nada.
    const { servicio, tx } = crearMocks();

    await servicio.updateMaterial(1, 3, 1);

    const data = tx.canteraMaterialMovimiento.update.mock.calls[0][0].data;
    expect(data.toneladas).toBe(40);
  });

  it('rechaza el cambio si la cantera no declara el material elegido', async () => {
    // Se corta la operación entera en vez de borrar el movimiento en silencio:
    // perder el consumo descuadraría el stock sin que nadie se entere.
    const { servicio, tx } = crearMocks();

    await expect(servicio.updateMaterial(1, 7, 1)).rejects.toThrow(
      /NO TIENE DECLARADO EL MATERIAL/i,
    );
    expect(tx.transportTrip.update).not.toHaveBeenCalled();
  });

  it('cambia el material igual cuando el viaje nunca descontó stock', async () => {
    const { servicio, tx } = crearMocks({ movimiento: null });

    await servicio.updateMaterial(1, 3, 1);

    expect(tx.transportTrip.update).toHaveBeenCalled();
    expect(tx.canteraMaterialMovimiento.update).not.toHaveBeenCalled();
  });

  it('no toca el stock si el viaje tiene movimiento pero no cantera resuelta', async () => {
    const { servicio, tx } = crearMocks({
      trip: { id: 1, materialId: 11, canteraId: null },
    });

    await servicio.updateMaterial(1, 3, 1);

    expect(tx.transportTrip.update).toHaveBeenCalled();
    expect(tx.canteraMaterialMovimiento.update).not.toHaveBeenCalled();
  });

  it('no hace nada si el material elegido es el que ya tenía', async () => {
    const { servicio, prisma } = crearMocks();

    await servicio.updateMaterial(1, 11, 1);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falla si el material no existe', async () => {
    const { servicio } = crearMocks();

    await expect(servicio.updateMaterial(1, 99, 1)).rejects.toThrow(
      'EL MATERIAL NO EXISTE',
    );
  });

  it('solo un ADMIN puede corregir el material', async () => {
    const { servicio } = crearMocks({ rolUsuario: 'SUPERVISOR' });

    await expect(servicio.updateMaterial(1, 3, 1)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('permite corregir aunque el viaje ya esté revisado: el material no afecta la desviación', async () => {
    const { servicio, tx } = crearMocks({
      trip: { id: 1, materialId: 11, canteraId: 1 },
    });

    await expect(servicio.updateMaterial(1, 3, 1)).resolves.toBeDefined();
    expect(tx.transportTrip.update).toHaveBeenCalled();
  });
});
