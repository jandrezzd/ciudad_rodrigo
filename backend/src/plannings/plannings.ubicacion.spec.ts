import { BadRequestException } from '@nestjs/common';
import { PlanningsService } from './plannings.service';

const crear = (actual: Record<string, unknown> = {}) => {
  const tx = {
    planningCantera: { findMany: jest.fn().mockResolvedValue([]) },
    planning: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    planning: {
      findUnique: jest.fn().mockResolvedValue({
        id: 5,
        vehicles: [],
        ubicacionLlegadaLat: null,
        ubicacionLlegadaLng: null,
        radioLlegadaM: 300,
        ...actual,
      }),
    },
    transportTrip: { updateMany: jest.fn() },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const ubicacion = { recalcularPlanificacion: jest.fn().mockResolvedValue(3) };
  const service = new PlanningsService(prisma, ubicacion as any);
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: 5 } as any);
  return { service, tx, ubicacion };
};

describe('PlanningsService — ubicación de llegada por defecto', () => {
  it('guarda el punto y recalcula los viajes de la planificación', async () => {
    const { service, tx, ubicacion } = crear();

    await service.update(5, {
      ubicacionLlegadaLat: -0.99,
      ubicacionLlegadaLng: -79.76,
    } as any);

    expect(tx.planning.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({
        ubicacionLlegadaLat: -0.99,
        ubicacionLlegadaLng: -79.76,
      }),
    });
    expect(ubicacion.recalcularPlanificacion).toHaveBeenCalledWith(5);
  });

  it('rechaza una sola coordenada', async () => {
    const { service } = crear();
    await expect(
      service.update(5, {
        ubicacionLlegadaLat: -0.99,
        ubicacionLlegadaLng: null,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('si nada cambió no recalcula', async () => {
    const { service, ubicacion } = crear({
      ubicacionLlegadaLat: -0.99,
      ubicacionLlegadaLng: -79.76,
    });
    await service.update(5, {
      ubicacionLlegadaLat: -0.99,
      ubicacionLlegadaLng: -79.76,
      radioLlegadaM: 300,
    } as any);
    expect(ubicacion.recalcularPlanificacion).not.toHaveBeenCalled();
  });

  it('quitar la ubicación la deja en null y recalcula', async () => {
    const { service, tx, ubicacion } = crear({
      ubicacionLlegadaLat: -0.99,
      ubicacionLlegadaLng: -79.76,
    });
    await service.update(5, {
      ubicacionLlegadaLat: null,
      ubicacionLlegadaLng: null,
    } as any);
    expect(tx.planning.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({
        ubicacionLlegadaLat: null,
        ubicacionLlegadaLng: null,
      }),
    });
    expect(ubicacion.recalcularPlanificacion).toHaveBeenCalledWith(5);
  });

  it('cambiar solo el radio también recalcula', async () => {
    const { service, ubicacion } = crear();
    await service.update(5, { radioLlegadaM: 150 } as any);
    expect(ubicacion.recalcularPlanificacion).toHaveBeenCalledWith(5);
  });
});
