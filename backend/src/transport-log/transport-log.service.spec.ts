import { TransportLogService } from './transport-log.service';
import { MAX_MATCH_GAP_HOURS } from './reconciliation/reconciliation.constants';

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
    create: jest.fn().mockResolvedValue({ id: 50, status: 'EN_PROGRESO' }),
    count: jest.fn().mockResolvedValue(0),
  },
  vehicleQRCode: { update: jest.fn().mockResolvedValue({}) },
  transportTripSequence: {
    upsert: jest.fn().mockResolvedValue({ year: 2026, last: 7 }),
  },
});

const crearPrisma = (tx: any) => ({
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: 3,
      roleRef: { name: 'SUPERVISOR' },
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
    create: jest.fn().mockResolvedValue({ id: 91 }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  transportDeparture: { findUnique: jest.fn().mockResolvedValue(null) },
  vehicleQRCode: {
    findUnique: jest.fn().mockResolvedValue({ vehicle: { id: 7 } }),
  },
  vehicle: { findUnique: jest.fn() },
  owner: { findUnique: jest.fn() },
  material: { findUnique: jest.fn().mockResolvedValue({ id: 3 }) },
  planningVehicle: { findFirst: jest.fn().mockResolvedValue(null) },
  planning: { findUnique: jest.fn() },
  client: {
    findUnique: jest.fn(({ where }: any) => Promise.resolve({ id: where.id })),
  },
  constSite: {
    findUnique: jest.fn(({ where }: any) => Promise.resolve({ id: where.id })),
  },
  transportTrip: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ id: 1 }),
  },
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
  let dashboard: {
    incrementArrivalCount: Mock;
    incrementDepartureCount: Mock;
    decrementDepartureCount: Mock;
  };
  let cantera: {
    resolverCantera: Mock;
    registrarConsumo: Mock;
    anularConsumo: Mock;
  };
  let reconciliation: {
    tryMatchNewDeparture: Mock;
    runReconciliationSweep: Mock;
  };
  let service: TransportLogService;

  beforeEach(() => {
    tx = crearTx();
    prisma = crearPrisma(tx);
    dashboard = {
      incrementArrivalCount: jest.fn().mockResolvedValue(undefined),
      incrementDepartureCount: jest.fn().mockResolvedValue(undefined),
      decrementDepartureCount: jest.fn().mockResolvedValue(undefined),
    };
    cantera = {
      resolverCantera: jest.fn().mockResolvedValue(null),
      registrarConsumo: jest.fn().mockResolvedValue(undefined),
      anularConsumo: jest.fn().mockResolvedValue(1),
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

      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

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
      tx.transportTrip.findUnique.mockResolvedValue({
        ...tripAbierto(),
        id: 2,
      });

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

      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

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

    // El incidente del 07/09/2026: la consulta solo tenía techo por arriba
    // (causalidad), no por abajo, así que una salida vieja abierta era
    // candidata válida y se emparejaba con una llegada de días después.
    it('acota la búsqueda por abajo con el techo de separación', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      await service.submitArrival(datosLlegada(), archivos(), 3);

      const sql = tx.$queryRaw.mock.calls[0][0].join('');
      expect(sql).toContain('"departureAt" >=');

      // Y el piso que se pasa es capturedAt menos el techo, no una fecha suelta.
      const parametros = tx.$queryRaw.mock.calls[0].slice(1);
      const piso = parametros.find(
        (p: any) => p instanceof Date && p < hace(0),
      );
      expect(piso).toBeDefined();
      const horasAtras = (hace(0).getTime() - piso.getTime()) / 3_600_000;
      expect(Math.round(horasAtras)).toBe(MAX_MATCH_GAP_HOURS);
    });

    // La columna guarda la hora UTC sin zona y Prisma manda los Date como
    // timestamptz: sin convertirlos, la ventana se corría según la zona de la
    // sesión de Postgres (UTC-5 => solo veía salidas de 5 a 17 h antes).
    it('compara las fechas en UTC, sin depender de la zona horaria de la sesión', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      await service.submitArrival(datosLlegada(), archivos(), 3);

      const sql = tx.$queryRaw.mock.calls[0][0].join('');
      expect(sql.match(/::timestamptz AT TIME ZONE 'UTC'/g)).toHaveLength(2);
    });

    // Con la salida fuera de la ventana, la llegada NO cierra ese viaje: queda
    // en staging para que la resuelva un ADMIN desde el panel de conciliación.
    it('manda la llegada a staging si la única salida abierta quedó fuera del techo', async () => {
      // La consulta ya no la devolvería (el piso la excluye), que es justo lo
      // que este caso simula: sin candidatas dentro de la ventana.
      tx.$queryRaw.mockResolvedValue([]);

      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

      expect(tx.transportArrivalPending.create).toHaveBeenCalled();
      expect(res.pendingMatch).toBe(true);
      expect(tx.transportTrip.update).not.toHaveBeenCalled();
    });

    it('imputa la llegada al día en que ocurrió, no al de hoy', async () => {
      const capturado = hace(3 * 24 * 60); // hace 3 días
      tx.$queryRaw.mockResolvedValue([
        { id: 1, departureAt: hace(3 * 24 * 60 + 120) },
      ]);
      tx.transportTrip.findUnique.mockResolvedValue(tripAbierto());

      await service.submitArrival(
        datosLlegada({ capturedAt: capturado.toISOString() }),
        archivos(),
        3,
      );

      expect(dashboard.incrementArrivalCount).toHaveBeenCalledWith(capturado);
    });
  });

  describe('submitArrival — resolución por departureUuid', () => {
    // Regresión: la app manda el departureUuid que resolvió al escanear. Si
    // para cuando sincroniza el viaje YA tiene una llegada (porque el
    // emparejamiento automático u otro dispositivo lo cerró primero), antes
    // se borraban las fotos y se respondía éxito sin guardar nada — la
    // llegada real se perdía sin aparecer ni en staging ni en la grilla.
    it('si el viaje ya tiene otra llegada (distinto clientUuid), no la descarta: la manda a staging', async () => {
      const viajeYaCerrado = {
        id: 1,
        vehicleId: 7,
        status: 'PENDIENTE_EMPAREJAMIENTO',
        arrival: { clientUuid: 'ya-guardada-por-otro-evento' },
      };
      prisma.transportTrip.findUnique = jest
        .fn()
        .mockResolvedValue(viajeYaCerrado);
      tx.transportTrip.findUnique.mockResolvedValue({
        ...viajeYaCerrado,
        departure: { m3: 20, m3Corrected: null },
        vehicle: { qrcode: { id: 9 } },
      });

      const res: any = await service.submitArrival(
        datosLlegada({ departureUuid: 'dep-uuid-1' }),
        archivos(),
        3,
      );

      expect(tx.transportArrivalPending.create).toHaveBeenCalled();
      expect(tx.transportTrip.update).not.toHaveBeenCalled();
      expect(res.pendingMatch).toBe(true);
      expect(res.data).toBeNull();
    });

    it('si el viaje ya tiene ESTA misma llegada (mismo clientUuid), es un reintento y no crea nada nuevo', async () => {
      const viajeYaCerrado = {
        id: 1,
        vehicleId: 7,
        status: 'COMPLETADO',
        arrival: { clientUuid: UUID_LLEGADA },
      };
      prisma.transportTrip.findUnique = jest
        .fn()
        .mockResolvedValue(viajeYaCerrado);
      tx.transportTrip.findUnique.mockResolvedValue({
        ...viajeYaCerrado,
        departure: { m3: 20, m3Corrected: null },
        vehicle: { qrcode: { id: 9 } },
      });

      await service.submitArrival(
        datosLlegada({ departureUuid: 'dep-uuid-1' }),
        archivos(),
        3,
      );

      expect(tx.transportArrivalPending.create).not.toHaveBeenCalled();
      expect(tx.transportTrip.update).not.toHaveBeenCalled();
    });
  });

  describe('submitArrival — idempotencia', () => {
    it('reconoce un reenvío del mismo clientUuid ya registrado', async () => {
      prisma.transportArrival.findUnique.mockResolvedValue({
        trip: { id: 1, status: 'COMPLETADO' },
      });

      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

      expect(res.idempotentReplay).toBe(true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reconoce un reenvío de una llegada que quedó en staging', async () => {
      prisma.transportArrivalPending.findUnique.mockResolvedValue({
        status: 'PENDIENTE',
        matchedTrip: null,
      });

      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

      expect(res.idempotentReplay).toBe(true);
      expect(res.pendingMatch).toBe(true);
    });
  });

  describe('guard anti-duplicado', () => {
    // Antes rechazaba con 409 no reintentable: la app dejaba el registro
    // atrapado en el celular para siempre. Ahora se guarda para revisión.
    it('una llegada a pocos minutos de otra del mismo vehículo queda para revisión, sin rechazo', async () => {
      prisma.transportArrivalPending.findFirst.mockResolvedValue({
        capturedAt: hace(2),
      });

      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

      expect(res.pendingMatch).toBe(true);
      expect(prisma.transportArrivalPending.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'EN_REVISION',
          vehicleId: 7,
          motivoRevision: expect.stringContaining('Posible duplicado'),
        }),
      });
      // EN_REVISION: no entra a la transacción de emparejamiento.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('también queda para revisión si la llegada cercana ya se emparejó', async () => {
      prisma.transportArrival.findFirst.mockResolvedValue({
        capturedAt: hace(4),
      });

      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

      expect(res.pendingMatch).toBe(true);
      expect(prisma.transportArrivalPending.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'EN_REVISION' }),
      });
    });

    it('el registro manual web sigue rechazando la llegada duplicada', async () => {
      prisma.transportArrival.findFirst.mockResolvedValue({
        capturedAt: hace(4),
      });
      prisma.transportTrip.findUnique.mockResolvedValue({ vehicleId: 7 });

      await expect(
        service.submitArrival(
          datosLlegada({ manual: 'true', tripId: '1', qrcode: undefined }),
          archivos(),
          3,
        ),
      ).rejects.toMatchObject({ code: 'DUPLICATE_ARRIVAL_WINDOW' });
    });

    it('no rechaza una llegada fuera de la ventana del guard', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

      expect(res.success).toBe(true);
    });

    const salidaApp = (extra: Record<string, any> = {}) => ({
      uuid: '22222222-2222-4222-8222-222222222222',
      capturedAt: hace(0).toISOString(),
      vehicleId: '7',
      clientId: '1',
      constSiteId: '1',
      departureM3: '21',
      departureLat: '-2.1894',
      departureLng: '-79.889',
      ...extra,
    });

    const prepararSalidaCercana = () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        roleRef: { name: 'SUPERVISOR' },
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
      prisma.transportTrip.findFirst.mockResolvedValue({
        id: 40,
        departureAt: hace(3),
      });
    };

    it('una salida a pocos minutos de otra se guarda marcada como posible duplicado', async () => {
      prepararSalidaCercana();

      await service.submitDeparture(3, salidaApp(), archivos());

      expect(tx.transportTrip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            posibleDuplicado: true,
            motivoRevision: expect.stringContaining(
              'Posible duplicado de la salida',
            ),
          }),
        }),
      );
      // La búsqueda de la salida cercana ignora las ya anuladas.
      expect(prisma.transportTrip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { not: 'CANCELADO' } }),
        }),
      );
    });

    it('el registro manual web sigue rechazando la salida duplicada', async () => {
      prepararSalidaCercana();

      await expect(
        service.submitDeparture(3, salidaApp({ manual: 'true' }), archivos()),
      ).rejects.toMatchObject({ code: 'DUPLICATE_DEPARTURE_WINDOW' });
      expect(tx.transportTrip.create).not.toHaveBeenCalled();
    });
  });

  describe('foto del material — obligatoria salvo en el registro manual', () => {
    const datosSalida = (extra: Record<string, any> = {}) => ({
      uuid: '44444444-4444-4444-8444-444444444444',
      capturedAt: hace(0).toISOString(),
      vehicleId: '7',
      clientId: '1',
      constSiteId: '1',
      departureM3: '21',
      departureLat: '-2.1894',
      departureLng: '-79.889',
      ...extra,
    });

    beforeEach(() => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 7,
        isActive: true,
        ownerId: null,
        company: 'CR',
        qrcode: { id: 9 },
        driverId: null,
      });
      prisma.transportTrip.findFirst.mockResolvedValue(null);
    });

    // Antes rechazaba: la salida quedaba atrapada en el celular.
    it('submitDeparture sin foto desde la app se guarda marcada para revisión', async () => {
      await service.submitDeparture(3, datosSalida(), {});

      expect(tx.transportTrip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            motivoRevision: 'Sin foto del material',
            posibleDuplicado: false,
          }),
        }),
      );
    });

    it('submitDeparture no exige foto cuando viene manual', async () => {
      // No se afirma éxito completo (el resto del flujo tiene más
      // dependencias externas a este mock) — solo que ya no rechaza
      // específicamente por falta de foto.
      try {
        await service.submitDeparture(3, datosSalida({ manual: 'true' }), {});
      } catch (e: any) {
        expect(e.code).not.toBe('MISSING_MATERIAL_PHOTO');
      }
    });

    it('submitArrival sin foto desde la app se guarda con el motivo', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const res: any = await service.submitArrival(datosLlegada(), {}, 3);

      expect(res.pendingMatch).toBe(true);
      expect(tx.transportArrivalPending.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          motivoRevision: 'Sin foto del material',
        }),
      });
    });

    it('submitArrival sin foto que cierra un viaje deja el motivo en el viaje', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 1, departureAt: hace(120) }]);
      tx.transportTrip.findUnique.mockResolvedValue(tripAbierto());

      await service.submitArrival(datosLlegada(), undefined, 3);

      expect(tx.transportTrip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            motivoRevision: 'Sin foto del material',
          }),
        }),
      );
    });

    it('submitArrival no exige foto cuando viene manual', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const res: any = await service.submitArrival(
        datosLlegada({ manual: 'true' }),
        {},
        3,
      );

      // Mismo camino que "sin salida abierta anterior, deja la llegada en
      // staging" (línea 129) — llega hasta el final sin que la foto lo frene.
      expect(res.pendingMatch).toBe(true);
    });
  });

  describe('submitDeparture — quién puede registrar una salida', () => {
    const datosSalida = (extra: Record<string, any> = {}) => ({
      uuid: '55555555-5555-4555-8555-555555555555',
      capturedAt: hace(0).toISOString(),
      vehicleId: '7',
      clientId: '1',
      constSiteId: '1',
      departureM3: '21',
      departureLat: '-2.1894',
      departureLng: '-79.889',
      manual: 'true',
      ...extra,
    });

    beforeEach(() => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 7,
        isActive: true,
        ownerId: null,
        company: 'CR',
        qrcode: { id: 9 },
        driverId: null,
      });
      prisma.transportTrip.findFirst.mockResolvedValue(null);
    });

    it('un ADMIN puede registrar una salida manual', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        roleRef: { name: 'ADMIN' },
        roletype: null,
      });

      try {
        await service.submitDeparture(3, datosSalida(), archivos());
      } catch (e: any) {
        expect(e.code).not.toBe('VALIDATION_ERROR');
      }
    });

    it('rechaza un rol que no es SUPERVISOR ni ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        roleRef: { name: 'PLANIFICADOR' },
        roletype: null,
      });

      await expect(
        service.submitDeparture(3, datosSalida(), archivos()),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'USTED NO TIENE PERMISO PARA REGISTRAR UNA SALIDA',
      });
    });
  });

  describe('getByQrCode — ambigüedad de viaje abierto', () => {
    const vehicleActivo = {
      id: 7,
      vehicleid: 'TCR-02-62',
      plate: 'GTY2083',
      isActive: true,
      driver: null,
      owner: null,
    };

    beforeEach(() => {
      prisma.vehicleQRCode.findUnique.mockResolvedValue({ id: 9 });
      prisma.vehicle.findUnique.mockResolvedValue(vehicleActivo);
    });

    it('sin viajes abiertos, ofrece crear una salida', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([]);

      const res: any = await service.getByQrCode('QR-9', 3);

      expect(res.action).toBe('CREATE_DEPARTURE');
      expect(res.vehicle.id).toBe(7);
    });

    it('con exactamente un viaje abierto, lo resuelve directo (caso normal)', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([
        { id: 101, departureAt: hace(120) },
      ]);

      const res: any = await service.getByQrCode('QR-9', 3);

      expect(res.action).toBe('CONTINUE_TO_ARRIVAL');
      expect(res.transportId).toBe(101);
      expect(res.data).toBeDefined();
      expect(res.ambiguous).toBeUndefined();
    });

    // El caso que causaba el bug: dos vueltas offline del mismo vehículo, sin
    // llegada aún. Antes esto devolvía "la más reciente" sin más — dos escaneos
    // seguidos (antes de que la primera llegada sincronizara) recibían el
    // MISMO transportId, dejando la otra salida huérfana.
    it('con dos viajes abiertos, no resuelve ninguno', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([
        { id: 102, departureAt: hace(60) },
        { id: 101, departureAt: hace(300) },
      ]);

      const res: any = await service.getByQrCode('QR-9', 3);

      expect(res.transportId).toBeUndefined();
      expect(res.data).toBeUndefined();
      expect(res.ambiguous).toBe(true);
      // El vehículo se sigue devolviendo: sin esto, la app de cantera
      // interpreta la respuesta como "no se encontró el vehículo".
      expect(res.vehicle.id).toBe(7);
    });

    it('la consulta pide como máximo 2 candidatos (basta para detectar ambigüedad)', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([]);

      await service.getByQrCode('QR-9', 3);

      expect(prisma.transportTrip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 }),
      );
    });

    // Ofrecer una salida de días atrás hacía que la llegada de hoy se pegara a
    // ella (llegada del 30/09 emparejada con una salida del 18/09).
    it('solo ofrece salidas recientes y no marcadas como posible duplicado', async () => {
      prisma.transportTrip.findMany.mockResolvedValue([]);

      await service.getByQrCode('QR-9', 3);

      const where = prisma.transportTrip.findMany.mock.calls[0][0].where;
      expect(where.posibleDuplicado).toBe(false);
      const horasAtras = (Date.now() - where.departureAt.gte.getTime()) / 3_600_000;
      expect(Math.round(horasAtras)).toBe(MAX_MATCH_GAP_HOURS);
    });
  });

  describe('submitArrival — salida indicada por la app (departureUuid)', () => {
    const viaje = (extra: Record<string, any> = {}) => ({
      id: 1,
      vehicleId: 7,
      status: 'EN_PROGRESO',
      posibleDuplicado: false,
      departureAt: hace(120),
      arrival: null,
      ...extra,
    });

    const conViajeIndicado = (extra: Record<string, any> = {}) => {
      prisma.transportTrip.findUnique.mockResolvedValue(viaje(extra));
      tx.transportTrip.findUnique.mockResolvedValue(tripAbierto());
    };

    it('si es válida, cierra ese viaje sin buscar otro', async () => {
      conViajeIndicado();

      await service.submitArrival(
        datosLlegada({ departureUuid: 'dep-uuid-1' }),
        archivos(),
        3,
      );

      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(tx.transportTrip.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });

    it.each([
      ['de otro vehículo', { vehicleId: 99 }],
      [
        'de hace más del techo de emparejamiento',
        { departureAt: hace((MAX_MATCH_GAP_HOURS + 1) * 60) },
      ],
      ['posterior a la llegada', { departureAt: new Date(AHORA + 60_000) }],
      ['marcada como posible duplicado', { posibleDuplicado: true }],
      ['de un viaje ya anulado', { status: 'CANCELADO' }],
    ])(
      'si es %s, la ignora y busca por el vehículo escaneado',
      async (_caso, extra) => {
        conViajeIndicado(extra);
        tx.$queryRaw.mockResolvedValue([]);

        const res: any = await service.submitArrival(
          datosLlegada({ departureUuid: 'dep-uuid-1' }),
          archivos(),
          3,
        );

        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.transportTrip.update).not.toHaveBeenCalled();
        expect(res.pendingMatch).toBe(true);
        // Queda bajo el vehículo del QR, no el del viaje indicado.
        expect(tx.transportArrivalPending.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            vehicleId: 7,
            departureUuid: 'dep-uuid-1',
          }),
        });
      },
    );

    // Antes: 409 NO_OPEN_DEPARTURE, reintentado para siempre por la app.
    it('si la salida no existe en el servidor, la guarda para revisión sin rechazar', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue(null);

      const res: any = await service.submitArrival(
        datosLlegada({ departureUuid: 'dep-uuid-1' }),
        archivos(),
        3,
      );

      expect(res.pendingMatch).toBe(true);
      expect(prisma.transportArrivalPending.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'EN_REVISION',
          vehicleId: 7,
          departureUuid: 'dep-uuid-1',
          motivoRevision: expect.stringContaining('aún no llegó'),
        }),
      });
    });
  });

  describe('submitArrival — QR no reconocido', () => {
    beforeEach(() => {
      prisma.vehicleQRCode.findUnique.mockResolvedValue(null);
    });

    // Antes: 404 QR_NOT_FOUND, la llegada quedaba atrapada en el celular.
    it('sin salida indicada, la guarda para revisión con el QR crudo', async () => {
      const res: any = await service.submitArrival(
        datosLlegada(),
        archivos(),
        3,
      );

      expect(res.pendingMatch).toBe(true);
      expect(prisma.transportArrivalPending.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'EN_REVISION',
          vehicleId: null,
          qrcode: 'QR-123',
          motivoRevision: expect.stringContaining('QR no reconocido'),
        }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('con una salida indicada válida, cierra ese viaje', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue({
        id: 1,
        vehicleId: 7,
        status: 'EN_PROGRESO',
        posibleDuplicado: false,
        departureAt: hace(120),
        arrival: null,
      });
      tx.transportTrip.findUnique.mockResolvedValue(tripAbierto());

      await service.submitArrival(
        datosLlegada({ departureUuid: 'dep-uuid-1' }),
        archivos(),
        3,
      );

      expect(tx.transportTrip.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });
  });

  describe('submitDeparture — validaciones que ya no rechazan registros de la app', () => {
    const salida = (extra: Record<string, any> = {}) => ({
      uuid: '66666666-6666-4666-8666-666666666666',
      capturedAt: hace(0).toISOString(),
      vehicleId: '7',
      clientId: '1',
      constSiteId: '1',
      departureM3: '21',
      departureLat: '-2.1894',
      departureLng: '-79.889',
      ...extra,
    });

    const vehiculo = (extra: Record<string, any> = {}) => ({
      id: 7,
      isActive: true,
      ownerId: null,
      company: 'CR',
      qrcode: { id: 9 },
      driverId: null,
      ...extra,
    });

    const datosCreados = () => tx.transportTrip.create.mock.calls[0][0].data;

    it('la salida nueva recibe el siguiente código correlativo', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo());

      await service.submitDeparture(3, salida(), archivos());

      expect(datosCreados().codigo).toBe(
        `TRA-00007-${new Date().getFullYear()}`,
      );
    });

    it('vehículo inactivo: se guarda con motivo', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo({ isActive: false }));

      await service.submitDeparture(3, salida(), archivos());

      expect(datosCreados().motivoRevision).toBe('Vehículo inactivo');
    });

    it('vehículo inactivo en el registro manual web: sigue rechazando', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo({ isActive: false }));

      await expect(
        service.submitDeparture(3, salida({ manual: 'true' }), archivos()),
      ).rejects.toMatchObject({ code: 'VEHICLE_INACTIVE' });
    });

    it('propietario inactivo y sin foto: acumula ambos motivos', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo({ ownerId: 5 }));
      prisma.owner.findUnique.mockResolvedValue({ id: 5, isActive: false });

      await service.submitDeparture(3, salida(), {});

      expect(datosCreados().motivoRevision).toBe(
        'Propietario inactivo · Sin foto del material',
      );
    });

    it('material inexistente: se guarda sin material y con motivo', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo());
      prisma.material.findUnique.mockResolvedValue(null);

      await service.submitDeparture(3, salida({ materialId: '999' }), archivos());

      const data = datosCreados();
      expect(data.material).toBeUndefined();
      expect(data.motivoRevision).toBe('Material inexistente (id 999)');
    });

    it('planificación inexistente con cliente y obra de la app: se guarda con motivo', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo());
      prisma.planning.findUnique.mockResolvedValue(null);

      await service.submitDeparture(3, salida({ planningId: '12' }), archivos());

      const data = datosCreados();
      expect(data.client).toEqual({ connect: { id: 1 } });
      expect(data.planning).toBeUndefined();
      expect(data.motivoRevision).toBe('Planificación inexistente (id 12)');
    });

    it('planificación inexistente sin cliente ni obra: error claro y reintentable', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo());
      prisma.planning.findUnique.mockResolvedValue(null);

      await expect(
        service.submitDeparture(
          3,
          salida({ planningId: '12', clientId: '0', constSiteId: '0' }),
          archivos(),
        ),
      ).rejects.toMatchObject({
        code: 'CLIENT_OR_SITE_NOT_FOUND',
        retryable: true,
      });
    });

    it('planificación y cliente inexistentes: usa la planificación del vehículo', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo());
      prisma.planning.findUnique.mockResolvedValue(null);
      prisma.planningVehicle.findFirst.mockResolvedValueOnce({
        planningId: 2,
        planning: { id: 2, clientId: 4, constSiteId: 4 },
      });

      await service.submitDeparture(
        3,
        salida({ planningId: '12', clientId: '99', constSiteId: '99' }),
        archivos(),
      );

      const data = datosCreados();
      expect(data.planning).toEqual({ connect: { id: 2 } });
      expect(data.client).toEqual({ connect: { id: 4 } });
      expect(data.constSite).toEqual({ connect: { id: 4 } });
      expect(data.motivoRevision).toBe('Planificación inexistente (id 12)');
    });

    it('sin planificación y cliente inexistente: error claro, no un 500', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo());
      prisma.client.findUnique.mockResolvedValueOnce(null as any);

      await expect(
        service.submitDeparture(3, salida({ clientId: '99' }), archivos()),
      ).rejects.toMatchObject({ code: 'CLIENT_OR_SITE_NOT_FOUND' });
      expect(tx.transportTrip.create).not.toHaveBeenCalled();
    });

    it('sin planificación y cliente 0: error claro, no un 500', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(vehiculo());

      await expect(
        service.submitDeparture(
          3,
          salida({ clientId: '0', constSiteId: '0' }),
          archivos(),
        ),
      ).rejects.toMatchObject({ code: 'CLIENT_OR_SITE_NOT_FOUND' });
    });
  });

  describe('acciones del ADMIN sobre registros marcados', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        roleRef: { name: 'ADMIN' },
      });
    });

    const duplicado = (extra: Record<string, any> = {}) => ({
      id: 50,
      vehicleId: 7,
      posibleDuplicado: true,
      motivoRevision: 'Sin foto del material · Posible duplicado de la salida de las 30/09 08:10 (viaje #40)',
      observation: null,
      departureAt: hace(30),
      vehicle: { qrcode: { id: 9 } },
      ...extra,
    });

    it('"es duplicado": anula el viaje, devuelve el stock y libera el QR', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue(duplicado());

      await service.resolverDuplicado(50, true, 1);

      expect(tx.transportTrip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 50 },
          data: expect.objectContaining({
            status: 'CANCELADO',
            posibleDuplicado: false,
          }),
        }),
      );
      expect(cantera.anularConsumo).toHaveBeenCalledWith(tx, 50);
      expect(tx.vehicleQRCode.update).toHaveBeenCalled();
      expect(dashboard.decrementDepartureCount).toHaveBeenCalled();
    });

    it('"es duplicado" no libera el QR si el vehículo tiene otra salida abierta', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue(duplicado());
      tx.transportTrip.count.mockResolvedValue(1);

      await service.resolverDuplicado(50, true, 1);

      expect(tx.vehicleQRCode.update).not.toHaveBeenCalled();
    });

    it('"no es duplicado": quita solo esa marca y reintenta el emparejamiento', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue(duplicado());

      await service.resolverDuplicado(50, false, 1);

      expect(prisma.transportTrip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            posibleDuplicado: false,
            motivoRevision: 'Sin foto del material',
          }),
        }),
      );
      expect(reconciliation.tryMatchNewDeparture).toHaveBeenCalledWith(50);
      expect(cantera.anularConsumo).not.toHaveBeenCalled();
    });

    it('rechaza resolver un viaje que ya no está marcado', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue(
        duplicado({ posibleDuplicado: false }),
      );

      await expect(service.resolverDuplicado(50, true, 1)).rejects.toMatchObject(
        { code: 'NOT_FLAGGED_DUPLICATE' },
      );
    });

    it('"marcar revisado" no aplica mientras siga como posible duplicado', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue(duplicado());

      await expect(service.marcarRevisado(50, 1)).rejects.toMatchObject({
        code: 'PENDING_DUPLICATE_DECISION',
      });
    });

    it('"marcar revisado" limpia el motivo', async () => {
      prisma.transportTrip.findUnique.mockResolvedValue(
        duplicado({ posibleDuplicado: false, motivoRevision: 'Vehículo inactivo' }),
      );

      await service.marcarRevisado(50, 1);

      expect(prisma.transportTrip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ motivoRevision: null }),
        }),
      );
    });

    it('descartar una llegada pendiente la marca DESCARTADO sin borrarla', async () => {
      prisma.transportArrivalPending.findUnique.mockResolvedValue({
        id: 156,
        observation: null,
      });

      await service.descartarLlegadaPendiente(156, 'Duplicado de la de 11:03', 1);

      expect(prisma.transportArrivalPending.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 156 }),
          data: expect.objectContaining({ status: 'DESCARTADO' }),
        }),
      );
    });

    it('descartar falla si otro proceso ya la emparejó', async () => {
      prisma.transportArrivalPending.findUnique.mockResolvedValue({
        id: 156,
        observation: null,
      });
      prisma.transportArrivalPending.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.descartarLlegadaPendiente(156, 'Duplicado', 1),
      ).rejects.toMatchObject({ code: 'PENDING_NOT_AVAILABLE' });
    });
  });
});
