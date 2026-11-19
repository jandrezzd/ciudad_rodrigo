import { UbicacionLlegadaService } from './ubicacion-llegada.service';

const A = { lat: -0.9996084, lng: -79.7662313 };
const referencia = (lat: number, lng: number) => ({
  ubicacionLlegadaLat: lat,
  ubicacionLlegadaLng: lng,
  radioLlegadaM: 300,
});

describe('UbicacionLlegadaService', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const crear = (trip: any) => {
    const prisma: any = {
      transportTrip: { findUnique: jest.fn().mockResolvedValue(trip) },
      transportArrival: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    return { prisma, service: new UbicacionLlegadaService(prisma) };
  };

  it('usa la planificación de la llegada antes que la del viaje', async () => {
    const { prisma, service } = crear({
      planning: referencia(1, 1),
      arrival: {
        id: 8,
        ...A,
        gpsPrecisionM: 10,
        fotosGps: null,
        capturedAt: new Date(),
        planning: referencia(A.lat, A.lng),
      },
    });

    await expect(service.recalcularViaje(1)).resolves.toBe(true);
    expect(prisma.transportArrival.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: expect.objectContaining({
        ubicacionLat: A.lat,
        ubicacionLng: A.lng,
        ubicacionDistanciaRefM: 0,
        ubicacionDentroRadio: true,
        ubicacionCalculadaEn: expect.any(Date),
      }),
    });
  });

  it('sin llegada no hace nada', async () => {
    const { prisma, service } = crear({ planning: null, arrival: null });
    await expect(service.recalcularViaje(1)).resolves.toBe(false);
    expect(prisma.transportArrival.update).not.toHaveBeenCalled();
  });

  it('si la base falla no lanza', async () => {
    const { prisma, service } = crear(null);
    prisma.transportTrip.findUnique.mockRejectedValue(new Error('caída'));
    await expect(service.recalcularViaje(1)).resolves.toBe(false);
  });

  it('recalcula todas las llegadas de una planificación', async () => {
    const { prisma, service } = crear({ planning: null, arrival: null });
    prisma.transportArrival.findMany.mockResolvedValue([
      { tripId: 1 },
      { tripId: 2 },
    ]);
    const espia = jest
      .spyOn(service, 'recalcularViaje')
      .mockResolvedValue(true);

    await expect(service.recalcularPlanificacion(5)).resolves.toBe(2);
    expect(prisma.transportArrival.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ planningId: 5 }, { planningId: null, trip: { planningId: 5 } }],
      },
      select: { tripId: true },
    });
    expect(espia).toHaveBeenCalledTimes(2);
  });
});
