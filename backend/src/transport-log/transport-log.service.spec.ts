import { TransportLogService } from './transport-log.service';

/**
 * Selección de salida en `submitArrival` (rama qrcode) y guards anti-duplicado.
 *
 * Antes este archivo era el stub que genera el CLI de Nest
 * (`providers: [TransportLogService]` sin mockear nada), que fallaba con
 * "Nest can't resolve dependencies". Se instancia el servicio a mano: tiene
 * cuatro dependencias y ninguna necesita el contenedor de DI para probar esto.
 */

const AHORA = Date.now();
/** Fecha a N minutos en el pasado. Relativa a ahora porque validateCapturedAt
 *  rechaza capturas de más de 90 días o en el futuro. */
const hace = (m: number) => new Date(AHORA - m * 60_000);

const UUID_LLEGADA = '11111111-1111-4111-8111-111111111111';

type Mock = ReturnType<typeof jest.fn>;

const crearTx = () => ({
  $queryRaw: jest.fn().mockResolvedValue([]),
  transportArrivalPending: { create: jest.fn().mockResolvedValue({ id: 90 }) },
  transportTrip: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({ id: 1, status: 'COMPLETADO' }),
  },
  vehicleQRCode: { update: jest.fn().mockResolvedValue({}) },
});

const crearPrisma = (tx: any) => ({
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: 3,
      role: 'SUPERVISOR',
      roletype: 'OBRA',
    }),
  },
  transportArrival: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  transportArrivalPending: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  transportDeparture: { findUnique: jest.fn().mockResolvedValue(null) },
  vehicleQRCode: {
    findUnique: jest.fn().mockResolvedValue({ vehicle: { id: 7 } }),
  },
  vehicle: { findUnique: jest.fn() },
  owner: { findUnique: jest.fn() },
  planningVehicle: { findFirst: jest.fn().mockResolvedValue(null) },
  planning: { findUnique: jest.fn() },
  transportTrip: { findFirst: jest.fn().mockResolvedValue(null) },
  $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
});

const datosLlegada = (extra: Record<string, any> = {}) => ({
  uuid: UUID_LLEGADA,
  qrcode: 'QR-123',
  arrivalM3: '21',
  arrivalLat: '-2.1894',
  arrivalLng: '-79.889',
  capturedAt: hace(0).toISOString(),
  abscisa: '100',
  almuerzo: 'false',
  source: 'OFFLINE',
  ...extra,
});

const archivos = () => ({ material: [{ path: 'uploads/transport/foto.jpg' }] });

const tripAbierto = (status = 'EN_PROGRESO') => ({
  id: 1,
  status,
  arrival: null,
  departure: { m3: 21, m3Corrected: null },
  almuerzoAplicado: false,
  vehicle: { qrcode: { id: 9 } },
});

describe('TransportLogService', () => {
  let tx: ReturnType<typeof crearTx>;
  let prisma: ReturnType<typeof crearPrisma>;
  let dashboard: { incrementArrivalCount: Mock; incrementDepartureCount: Mock };
  let cantera: { resolverCantera: Mock; registrarConsumo: Mock };
  let reconciliation: { tryMatchNewDeparture: Mock; runReconciliationSweep: Mock };
  let service: TransportLogService;

  beforeEach(() => {
    tx = crearTx();
    prisma = crearPrisma(tx);
    dashboard = {
      incrementArrivalCount: jest.fn().mockResolvedValue(undefined),
      incrementDepartureCount: jest.fn().mockResolvedValue(undefined),
    };
    cantera = {
      resolverCantera: jest.fn().mockResolvedValue(null),
      registrarConsumo: jest.fn().mockResolvedValue(undefined),
    };
    reconciliation = {
      tryMatchNewDeparture: jest.fn().mockResolvedValue(undefined),
      runReconciliationSweep: jest.fn().mockResolvedValue(undefined),
    };
    service = new TransportLogService(
      prisma as any,
      dashboard as any,
      cantera as any,
      reconciliation as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('submitArrival — elección de salida (rama qrcode)', () => {
    // Regresión: antes se rechazaba con 409 NO_OPEN_DEPARTURE. La salida puede
    // seguir offline en el celular del otro supervisor.
    it('sin salida abierta anterior, deja la llegada en staging', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const res: any = await service.submitArrival(datosLlegada(), archivos(), 3);

      expect(tx.transportArrivalPending.create).toHaveBeenCalled();
      expect(res.pendingMatch).toBe(true);
      expect(res.data).toBeNull();
      expect(tx.transportTrip.update).not.toHaveBeenCalled();
    });

    it('con una sola salida anterior, cierra ese viaje', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 1, departureAt: hace(120) }]);
      tx.transportTrip.findUnique.mockResolvedValue(tripAbierto());

      await service.submitArrival(datosLlegada(), archivos(), 3);

      expect(tx.transportTrip.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(tx.transportArrivalPending.create).not.toHaveBeenCalled();
    });

    // El cambio de fondo: antes era FIFO (`ORDER BY departureAt ASC LIMIT 1`),
    // que cerraba la salida MÁS VIEJA — la abandonada por avería, no la real.
    it('con dos salidas separadas, toma la más reciente y no la más antigua', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: 2, departureAt: hace(120) }, // más reciente
        { id: 1, departureAt: hace(600) }, // abandonada
      ]);
      tx.transportTrip.findUnique.mockResolvedValue({ ...tripAbierto(), id: 2 });

      await service.submitArrival(datosLlegada(), archivos(), 3);

      expect(tx.transportTrip.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 2 } }),
      );
    });

    it('con dos salidas casi empatadas, no adivina: va a staging', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: 2, departureAt: hace(120) },
        { id: 1, departureAt: hace(122) }, // 2 min < TIE_MARGIN_MIN (3)
      ]);

      const res: any = await service.submitArrival(datosLlegada(), archivos(), 3);

      expect(tx.transportArrivalPending.create).toHaveBeenCalled();
      expect(res.pendingMatch).toBe(true);
      expect(tx.transportTrip.update).not.toHaveBeenCalled();
    });

    // Regresión del bug anterior: PENDIENTE_EMPAREJAMIENTO quedaba fuera de la
    // consulta y del chequeo de estado, así que un viaje marcado así no se
    // podía cerrar nunca por esta vía. Nunca fue un estado terminal.
    it('considera candidatas las salidas en PENDIENTE_EMPAREJAMIENTO', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 1, departureAt: hace(120) }]);
      tx.transportTrip.findUnique.mockResolvedValue(
        tripAbierto('PENDIENTE_EMPAREJAMIENTO'),
      );

      await service.submitArrival(datosLlegada(), archivos(), 3);

      // El estado no la rechaza...
      expect(tx.transportTrip.update).toHaveBeenCalled();
      // ...y la consulta la incluye.
      const sql = tx.$queryRaw.mock.calls[0][0].join('');
      expect(sql).toContain('PENDIENTE_EMPAREJAMIENTO');
    });

    it('exige causalidad en la consulta: solo salidas anteriores a la llegada', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      await service.submitArrival(datosLlegada(), archivos(), 3);

      const sql = tx.$queryRaw.mock.calls[0][0].join('');
      expect(sql).toContain('"departureAt" <');
      expect(sql).toContain('ORDER BY "departureAt" DESC');
    });

    it('imputa la llegada al día en que ocurrió, no al de hoy', async () => {
      const capturado = hace(3 * 24 * 60); // hace 3 días
      tx.$queryRaw.mockResolvedValue([{ id: 1, departureAt: hace(3 * 24 * 60 + 120) }]);
      tx.transportTrip.findUnique.mockResolvedValue(tripAbierto());

      await service.submitArrival(
        datosLlegada({ capturedAt: capturado.toISOString() }),
        archivos(),
        3,
      );

      expect(dashboard.incrementArrivalCount).toHaveBeenCalledWith(capturado);
    });
  });

  describe('submitArrival — idempotencia', () => {
    it('reconoce un reenvío del mismo clientUuid ya registrado', async () => {
      prisma.transportArrival.findUnique.mockResolvedValue({
        trip: { id: 1, status: 'COMPLETADO' },
      });

      const res: any = await service.submitArrival(datosLlegada(), archivos(), 3);

      expect(res.idempotentReplay).toBe(true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reconoce un reenvío de una llegada que quedó en staging', async () => {
      prisma.transportArrivalPending.findUnique.mockResolvedValue({
        status: 'PENDIENTE',
        matchedTrip: null,
      });

      const res: any = await service.submitArrival(datosLlegada(), archivos(), 3);

      expect(res.idempotentReplay).toBe(true);
      expect(res.pendingMatch).toBe(true);
    });
  });

  describe('guard anti-duplicado', () => {
    // No se reintenta: el SyncWorker del móvil reintenta 72 h todo lo que venga
    // marcado reintentable, y este error nunca se resolvería solo.
    it('rechaza una llegada a pocos minutos de otra del mismo vehículo', async () => {
      prisma.transportArrivalPending.findFirst.mockResolvedValue({
        capturedAt: hace(2),
      });

      await expect(
        service.submitArrival(datosLlegada(), archivos(), 3),
      ).rejects.toMatchObject({
        code: 'DUPLICATE_ARRIVAL_WINDOW',
        statusCode: 409,
        retryable: false,
      });
    });

    it('rechaza también si la llegada cercana ya se emparejó', async () => {
      prisma.transportArrival.findFirst.mockResolvedValue({ capturedAt: hace(4) });

      await expect(
        service.submitArrival(datosLlegada(), archivos(), 3),
      ).rejects.toMatchObject({ code: 'DUPLICATE_ARRIVAL_WINDOW' });
    });

    it('no rechaza una llegada fuera de la ventana del guard', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const res: any = await service.submitArrival(datosLlegada(), archivos(), 3);

      expect(res.success).toBe(true);
    });

    // Este es el guard que puede bloquear trabajo real si la ventana quedó mal
    // calibrada, así que su comportamiento tiene que estar fijado por un test.
    it('rechaza una salida a pocos minutos de otra del mismo vehículo', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        role: 'SUPERVISOR',
        roletype: 'CANTERA',
      });
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 7,
        isActive: true,
        ownerId: null,
        company: 'CR',
        qrcode: { id: 9 },
        driverId: null,
      });
      prisma.transportTrip.findFirst.mockResolvedValue({ departureAt: hace(3) });

      await expect(
        service.submitDeparture(
          3,
          {
            uuid: '22222222-2222-4222-8222-222222222222',
            capturedAt: hace(0).toISOString(),
            vehicleId: '7',
            clientId: '1',
            constSiteId: '1',
            departureM3: '21',
            departureLat: '-2.1894',
            departureLng: '-79.889',
          },
          archivos(),
        ),
      ).rejects.toMatchObject({
        code: 'DUPLICATE_DEPARTURE_WINDOW',
        statusCode: 409,
        retryable: false,
      });
    });
  });
});
