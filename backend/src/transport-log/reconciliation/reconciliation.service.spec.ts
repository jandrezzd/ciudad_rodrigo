/**
 * Los tres disparadores del emparejamiento, con Prisma mockeado.
 *
 * RECONCILIATION_MODE se lee a nivel de módulo desde el entorno, así que el
 * servicio se instancia con `jest.resetModules()` + `require()` después de
 * fijar la variable. Es la única forma de cubrir los tres modos, y el modo es
 * justamente el mecanismo de seguridad del despliegue: si `shadow` no dejara
 * el comportamiento intacto, el interruptor no serviría de nada.
 */

import { MAX_MATCH_GAP_HOURS } from './reconciliation.constants';

const BASE = new Date('2026-08-31T07:00:00.000Z').getTime();
const min = (m: number) => new Date(BASE + m * 60_000);

// jest.Mock a secas (no ReturnType<typeof jest.fn>): esa forma infiere el
// argumento de mockResolvedValue como `never` y tsc rechaza cada mock.
type Mock = jest.Mock<any, any>;

interface PrismaMock {
  transportTrip: Record<string, Mock>;
  transportArrivalPending: Record<string, Mock>;
  transportArrival: Record<string, Mock>;
  vehicleQRCode: Record<string, Mock>;
  $transaction: Mock;
}

const crearPrismaMock = (): PrismaMock => ({
  transportTrip: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  transportArrivalPending: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  transportArrival: { findUnique: jest.fn().mockResolvedValue(null) },
  vehicleQRCode: { update: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn(),
});

const crearDashboardMock = () => ({
  incrementArrivalCount: jest.fn().mockResolvedValue(undefined),
});

/** Instancia el servicio con el modo pedido, recargando las constantes. */
const construirServicio = (
  modo: 'window' | 'shadow' | 'gap',
  prisma: PrismaMock,
  dashboard: any,
) => {
  jest.resetModules();
  process.env.RECONCILIATION_MODE = modo;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ReconciliationService } = require('./reconciliation.service');
  return new ReconciliationService(prisma as any, dashboard as any);
};

describe('ReconciliationService', () => {
  let prisma: PrismaMock;
  let dashboard: ReturnType<typeof crearDashboardMock>;
  const modoOriginal = process.env.RECONCILIATION_MODE;

  beforeEach(() => {
    prisma = crearPrismaMock();
    dashboard = crearDashboardMock();
    // Silencia los logger.warn/error esperados de cada caso.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (modoOriginal === undefined) delete process.env.RECONCILIATION_MODE;
    else process.env.RECONCILIATION_MODE = modoOriginal;
  });

  describe('tryMatchNewDeparture (modo gap)', () => {
    const prepararTrip = (vehicleId = 7, departureAt = min(0)) => {
      prisma.transportTrip.findUnique.mockResolvedValue({
        id: 1,
        vehicleId,
        departureAt,
        almuerzoAplicado: false,
        planning: null,
      });
    };

    it('no empareja si no hay llegadas pendientes posteriores', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const cerrar = jest.spyOn(service, 'closeTripWithPendingArrival');
      prepararTrip();
      prisma.transportArrivalPending.findMany.mockResolvedValue([]);

      await service.tryMatchNewDeparture(1);

      expect(cerrar).not.toHaveBeenCalled();
    });

    it('empareja cuando hay una sola candidata', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const cerrar = jest
        .spyOn(service, 'closeTripWithPendingArrival')
        .mockResolvedValue(true);
      prepararTrip();
      prisma.transportArrivalPending.findMany.mockResolvedValue([
        { id: 55, capturedAt: min(120) },
      ]);

      await service.tryMatchNewDeparture(1);

      expect(cerrar).toHaveBeenCalledWith(1, 55);
    });

    it('toma la más próxima cuando hay dos separadas', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const cerrar = jest
        .spyOn(service, 'closeTripWithPendingArrival')
        .mockResolvedValue(true);
      prepararTrip();
      prisma.transportArrivalPending.findMany.mockResolvedValue([
        { id: 55, capturedAt: min(120) },
        { id: 56, capturedAt: min(300) },
      ]);

      await service.tryMatchNewDeparture(1);

      expect(cerrar).toHaveBeenCalledWith(1, 55);
    });

    it('no empareja cuando las dos candidatas están empatadas', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const cerrar = jest.spyOn(service, 'closeTripWithPendingArrival');
      prepararTrip();
      prisma.transportArrivalPending.findMany.mockResolvedValue([
        { id: 55, capturedAt: min(120) },
        { id: 56, capturedAt: min(122) }, // 2 min < TIE_MARGIN_MIN (3)
      ]);

      await service.tryMatchNewDeparture(1);

      expect(cerrar).not.toHaveBeenCalled();
    });

    // La ventana se acota en la CONSULTA, no en memoria, por los dos lados:
    // causalidad abajo (la llegada es posterior a la salida) y el techo de
    // separación arriba (una llegada de días después no es de este viaje).
    it('acota la búsqueda por causalidad y por el techo de separación', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      jest.spyOn(service, 'closeTripWithPendingArrival').mockResolvedValue(true);
      prepararTrip(7, min(100));
      prisma.transportArrivalPending.findMany.mockResolvedValue([]);

      await service.tryMatchNewDeparture(1);

      const { where } = prisma.transportArrivalPending.findMany.mock.calls[0][0];
      expect(where.capturedAt.gt).toEqual(min(100));

      const horasDeVentana =
        (where.capturedAt.lte.getTime() - min(100).getTime()) / 3_600_000;
      expect(horasDeVentana).toBe(MAX_MATCH_GAP_HOURS);
    });

    // Se llama después de que submitDeparture ya confirmó la salida: un fallo
    // acá nunca debe hacer perder una salida ya registrada.
    it('no propaga errores internos', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      prisma.transportTrip.findUnique.mockRejectedValue(new Error('BD caída'));

      await expect(service.tryMatchNewDeparture(1)).resolves.toBeUndefined();
    });
  });

  describe('tryMatchNewDeparture (modo shadow)', () => {
    // El interruptor de despliegue: en shadow el comportamiento REAL tiene que
    // ser el viejo. Un viaje sin tiempoPromedioViajeMin no emparejaba antes, y
    // no debe emparejar ahora, aunque el criterio nuevo sí encuentre candidata.
    it('mantiene el comportamiento del criterio viejo', async () => {
      const service = construirServicio('shadow', prisma, dashboard);
      const cerrar = jest.spyOn(service, 'closeTripWithPendingArrival');
      prisma.transportTrip.findUnique.mockResolvedValue({
        id: 1,
        vehicleId: 7,
        departureAt: min(0),
        almuerzoAplicado: false,
        planning: null, // sin tiempoPromedioViajeMin => el viejo no empareja
      });
      prisma.transportArrivalPending.findMany.mockResolvedValue([
        { id: 55, capturedAt: min(120) },
      ]);

      await service.tryMatchNewDeparture(1);

      expect(cerrar).not.toHaveBeenCalled();
    });
  });

  describe('closeTripWithPendingArrival', () => {
    const prepararTransaccion = (tx: any) => {
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
    };

    const txBase = () => ({
      transportArrivalPending: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 55,
          clientUuid: 'uuid-llegada',
          capturedAt: min(120),
          receivedAt: min(121),
          userId: 3,
          m3: 21,
          m3Corrected: null,
          lat: 0,
          lng: 0,
          abscisa: null,
          almuerzo: false,
          observation: null,
          source: 'OFFLINE',
          driverPhoto: null,
          vehiclePhoto: null,
          platePhoto: null,
          materialPhoto1: null,
          materialPhoto2: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      transportTrip: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      transportArrival: { findUnique: jest.fn().mockResolvedValue(null) },
      vehicleQRCode: { update: jest.fn().mockResolvedValue({}) },
    });

    it('cierra el viaje y descuenta el día real de la llegada', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const tx = txBase();
      tx.transportTrip.findUnique.mockResolvedValue({
        id: 1,
        status: 'EN_PROGRESO',
        arrival: null,
        departure: { m3: 21, m3Corrected: null },
        almuerzoAplicado: false,
        vehicle: { qrcode: { id: 9 } },
      });
      prepararTransaccion(tx);

      const cerrado = await service.closeTripWithPendingArrival(1, 55);

      expect(cerrado).toBe(true);
      // El contador va al día en que ocurrió la llegada, no al de hoy.
      expect(dashboard.incrementArrivalCount).toHaveBeenCalledWith(min(120));
      expect(tx.vehicleQRCode.update).toHaveBeenCalled();
    });

    // Este es el bug original del 500: un Error pelado salía como
    // "Internal server error" sin decirle nada al administrador.
    it('lanza BusinessException, no Error pelado, si el viaje ya no es elegible', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const tx = txBase();
      tx.transportTrip.findUnique.mockResolvedValue({
        id: 1,
        status: 'COMPLETADO',
        arrival: null,
        departure: { m3: 21 },
        vehicle: null,
      });
      prepararTransaccion(tx);

      // Se afirma sobre la forma y no con instanceof: jest.resetModules() hace
      // que la clase que ve el servicio recargado sea otra instancia de módulo
      // que la importada acá. Además esto es más fiel — son exactamente los
      // campos que el filtro global usa para armar la respuesta HTTP, y lo que
      // distingue una BusinessException de un Error pelado (que saldría como
      // 500 "Internal server error").
      await expect(service.closeTripWithPendingArrival(1, 55)).rejects.toMatchObject({
        name: 'BusinessException',
        code: 'TRIP_NOT_ELIGIBLE',
        statusCode: 409,
        retryable: false,
      });
    });

    it('lanza BusinessException si el viaje ya tiene llegada', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const tx = txBase();
      tx.transportTrip.findUnique.mockResolvedValue({
        id: 1,
        status: 'EN_PROGRESO',
        arrival: { id: 99 },
        departure: { m3: 21 },
        vehicle: null,
      });
      prepararTransaccion(tx);

      await expect(service.closeTripWithPendingArrival(1, 55)).rejects.toMatchObject({
        code: 'TRIP_ALREADY_CLOSED',
      });
    });

    // Registro duplicado desde el celular: la misma llegada quedó copiada en
    // TransportArrival y en staging. Sin esta comprobación el create de abajo
    // reventaba con un P2002 crudo -> otro 500 sin explicación.
    it('detecta que el clientUuid ya existe como llegada registrada', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const tx = txBase();
      tx.transportTrip.findUnique.mockResolvedValue({
        id: 1,
        status: 'EN_PROGRESO',
        arrival: null,
        departure: { m3: 21, m3Corrected: null },
        almuerzoAplicado: false,
        vehicle: null,
      });
      tx.transportArrival.findUnique.mockResolvedValue({ tripId: 42 });
      prepararTransaccion(tx);

      await expect(service.closeTripWithPendingArrival(1, 55)).rejects.toMatchObject({
        code: 'ARRIVAL_ALREADY_EXISTS',
      });
    });

    it('no cierra nada si otro proceso ya reclamó la llegada', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const tx = txBase();
      tx.transportArrivalPending.updateMany.mockResolvedValue({ count: 0 });
      prepararTransaccion(tx);

      await expect(service.closeTripWithPendingArrival(1, 55)).resolves.toBe(false);
      expect(dashboard.incrementArrivalCount).not.toHaveBeenCalled();
    });

    // El emparejamiento ya está guardado: un fallo de estadísticas no debe
    // devolver un 500 sobre trabajo que sí se completó.
    it('no falla si el contador del dashboard revienta', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const tx = txBase();
      tx.transportTrip.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDIENTE_EMPAREJAMIENTO',
        arrival: null,
        departure: { m3: 21, m3Corrected: null },
        almuerzoAplicado: false,
        vehicle: null,
      });
      prepararTransaccion(tx);
      dashboard.incrementArrivalCount.mockRejectedValue(new Error('DailyStats caído'));

      await expect(service.closeTripWithPendingArrival(1, 55)).resolves.toBe(true);
    });
  });

  describe('runReconciliationSweep (modo gap)', () => {
    it('no cruza vehículos distintos', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const cerrar = jest
        .spyOn(service, 'closeTripWithPendingArrival')
        .mockResolvedValue(true);
      prisma.transportTrip.findMany.mockResolvedValue([
        { id: 1, vehicleId: 7, departureAt: min(0), planning: null },
      ]);
      prisma.transportArrivalPending.findMany.mockResolvedValue([
        { id: 55, vehicleId: 99, capturedAt: min(120) }, // otro vehículo
      ]);

      await service.runReconciliationSweep();

      expect(cerrar).not.toHaveBeenCalled();
    });

    it('empareja el conjunto completo de un vehículo por menor gap', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const cerrar = jest
        .spyOn(service, 'closeTripWithPendingArrival')
        .mockResolvedValue(true);
      prisma.transportTrip.findMany.mockResolvedValue([
        { id: 1, vehicleId: 7, departureAt: min(0), planning: null },
        { id: 2, vehicleId: 7, departureAt: min(200), planning: null },
      ]);
      prisma.transportArrivalPending.findMany.mockResolvedValue([
        { id: 60, vehicleId: 7, capturedAt: min(300) },
        { id: 55, vehicleId: 7, capturedAt: min(100) },
      ]);

      await service.runReconciliationSweep();

      expect(cerrar).toHaveBeenCalledWith(1, 55);
      expect(cerrar).toHaveBeenCalledWith(2, 60);
    });

    // El barrido recorre TODOS los viajes abiertos del sistema: un viaje
    // inconsistente no puede dejar sin emparejar a todos los demás.
    it('un viaje que falla no aborta la pasada completa', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      const cerrar = jest
        .spyOn(service, 'closeTripWithPendingArrival')
        .mockRejectedValueOnce(new Error('viaje inconsistente'))
        .mockResolvedValue(true);
      prisma.transportTrip.findMany.mockResolvedValue([
        { id: 1, vehicleId: 7, departureAt: min(0), planning: null },
        { id: 2, vehicleId: 8, departureAt: min(0), planning: null },
      ]);
      prisma.transportArrivalPending.findMany.mockResolvedValue([
        { id: 55, vehicleId: 7, capturedAt: min(100) },
        { id: 56, vehicleId: 8, capturedAt: min(100) },
      ]);

      await service.runReconciliationSweep();

      expect(cerrar).toHaveBeenCalledTimes(2);
      // Y la limpieza posterior igual corre.
      expect(prisma.transportArrivalPending.updateMany).toHaveBeenCalled();
    });

    // Antes esto dependía de tener tiempoPromedioViajeMin cargado: un viaje sin
    // planificación no se marcaba nunca y quedaba EN_PROGRESO para siempre.
    it('marca PENDIENTE_EMPAREJAMIENTO por antigüedad, sin depender de la planificación', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      prisma.transportTrip.updateMany.mockResolvedValue({ count: 2 });

      await service.runReconciliationSweep();

      expect(prisma.transportTrip.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'EN_PROGRESO',
            arrival: null,
            departureAt: { lt: expect.any(Date) },
          }),
          data: { status: 'PENDIENTE_EMPAREJAMIENTO' },
        }),
      );
    });

    it('marca EXPIRADO solo las pendientes más viejas que el umbral', async () => {
      const service = construirServicio('gap', prisma, dashboard);

      await service.runReconciliationSweep();

      const llamada = prisma.transportArrivalPending.updateMany.mock.calls[0][0];
      expect(llamada.where.status).toBe('PENDIENTE');
      expect(llamada.data).toEqual({ status: 'EXPIRADO' });
      const corte: Date = llamada.where.capturedAt.lt;
      const diasAtras = (Date.now() - corte.getTime()) / (24 * 60 * 60 * 1000);
      expect(Math.round(diasAtras)).toBe(7);
    });

    it('no propaga errores', async () => {
      const service = construirServicio('gap', prisma, dashboard);
      prisma.transportTrip.findMany.mockRejectedValue(new Error('BD caída'));

      await expect(service.runReconciliationSweep()).resolves.toBeUndefined();
    });
  });

  describe('runReconciliationSweep (modo shadow)', () => {
    // La garantía del despliegue: shadow observa, no toca.
    it('no empareja por el criterio nuevo, solo registra', async () => {
      const service = construirServicio('shadow', prisma, dashboard);
      const cerrar = jest.spyOn(service, 'closeTripWithPendingArrival');
      prisma.transportTrip.findMany.mockResolvedValue([
        { id: 1, vehicleId: 7, departureAt: min(0), planning: null },
      ]);
      prisma.transportArrivalPending.findMany.mockResolvedValue([
        { id: 55, vehicleId: 7, capturedAt: min(100) },
      ]);

      await service.runReconciliationSweep();

      expect(cerrar).not.toHaveBeenCalled();
    });
  });
});
