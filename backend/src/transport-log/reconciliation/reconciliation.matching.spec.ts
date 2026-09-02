import {
  computeGreedyMatches,
  groupBy,
  MatchableArrival,
  MatchableDeparture,
} from './reconciliation.matching';

/** Fecha relativa a un origen fijo, en minutos, para que los casos se lean. */
const BASE = new Date('2026-08-31T07:00:00.000Z').getTime();
const min = (m: number) => new Date(BASE + m * 60_000);

const salida = (tripId: number, m: number): MatchableDeparture => ({
  tripId,
  departureAt: min(m),
});
const llegada = (pendingArrivalId: number, m: number): MatchableArrival => ({
  pendingArrivalId,
  capturedAt: min(m),
});

const MARGEN_3_MIN = 3 * 60_000;

describe('computeGreedyMatches', () => {
  it('empareja una salida con la única llegada posterior', () => {
    const { matches, ambiguous } = computeGreedyMatches(
      [salida(1, 0)],
      [llegada(10, 120)],
      MARGEN_3_MIN,
    );

    expect(matches).toEqual([{ tripId: 1, pendingArrivalId: 10 }]);
    expect(ambiguous).toHaveLength(0);
  });

  it('no empareja una llegada anterior a la salida (causalidad)', () => {
    const { matches } = computeGreedyMatches(
      [salida(1, 100)],
      [llegada(10, 30)],
      MARGEN_3_MIN,
    );

    expect(matches).toHaveLength(0);
  });

  it('no empareja una llegada simultánea a la salida (gap cero)', () => {
    const { matches } = computeGreedyMatches(
      [salida(1, 60)],
      [llegada(10, 60)],
      MARGEN_3_MIN,
    );

    expect(matches).toHaveLength(0);
  });

  // El caso real que originó el cambio: GTY2083 el 31/08. Salida 07:38, dos
  // llegadas (09:35 y 18:18). El criterio viejo no emparejaba ninguna; el nuevo
  // debe elegir la de 09:35 por estar mucho más cerca.
  it('elige la llegada más próxima, no la más lejana', () => {
    const { matches } = computeGreedyMatches(
      [salida(1, 38)], // 07:38
      [llegada(10, 675), llegada(11, 155)], // 18:15 y 09:35
      MARGEN_3_MIN,
    );

    expect(matches).toEqual([{ tripId: 1, pendingArrivalId: 11 }]);
  });

  it('arma los pares por menor gap y no por orden de inserción (no es FIFO)', () => {
    // Tres vueltas del día. Las llegadas se pasan en desorden a propósito.
    const departures = [salida(1, 0), salida(2, 200), salida(3, 400)];
    const arrivals = [llegada(30, 500), llegada(10, 100), llegada(20, 300)];

    const { matches, ambiguous } = computeGreedyMatches(
      departures,
      arrivals,
      MARGEN_3_MIN,
    );

    expect(ambiguous).toHaveLength(0);
    expect(matches).toHaveLength(3);
    expect(new Set(matches.map((m) => `${m.tripId}-${m.pendingArrivalId}`))).toEqual(
      new Set(['1-10', '2-20', '3-30']),
    );
  });

  // Caso más común de todos: un camión con ruta regular hace varias vueltas de
  // duración casi idéntica. Los tres pares correctos tienen gaps parecidos,
  // pero son disjuntos entre sí (salidas y llegadas distintas), así que no
  // compiten: los tres deben emparejarse igual. Una comparación de "los dos
  // mejores pares globales" los declararía empatados y no emparejaría nada.
  it('empareja vueltas de duración casi idéntica: gaps parecidos pero sin conflicto', () => {
    const { matches, ambiguous } = computeGreedyMatches(
      [salida(1, 0), salida(2, 200), salida(3, 400)],
      [llegada(10, 100), llegada(20, 300), llegada(30, 500)], // los 3 gaps = 100
      MARGEN_3_MIN,
    );

    expect(ambiguous).toHaveLength(0);
    expect(new Set(matches.map((m) => `${m.tripId}-${m.pendingArrivalId}`))).toEqual(
      new Set(['1-10', '2-20', '3-30']),
    );
  });

  // Vehículo que se averió: quedó una salida vieja abierta que nunca cerró, se
  // reparó y volvió a salir. La llegada corresponde a la salida reciente. Un
  // FIFO puro ("la más antigua primero") la asignaría a la vieja.
  it('asigna la llegada a la salida reciente, no a la abandonada por avería', () => {
    const { matches } = computeGreedyMatches(
      [salida(1, 0), salida(2, 600)],
      [llegada(10, 700)],
      MARGEN_3_MIN,
    );

    expect(matches).toEqual([{ tripId: 2, pendingArrivalId: 10 }]);
  });

  it('no auto-resuelve cuando dos llegadas están empatadas contra la misma salida', () => {
    const { matches, ambiguous } = computeGreedyMatches(
      [salida(1, 0)],
      [llegada(10, 120), llegada(11, 122)], // 2 min de diferencia, bajo el margen
      MARGEN_3_MIN,
    );

    expect(matches).toHaveLength(0);
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0].reason).toBe('tie');
  });

  it('sí resuelve cuando la diferencia supera el margen de empate', () => {
    const { matches, ambiguous } = computeGreedyMatches(
      [salida(1, 0)],
      [llegada(10, 120), llegada(11, 130)], // 10 min > 3 min de margen
      MARGEN_3_MIN,
    );

    expect(matches).toEqual([{ tripId: 1, pendingArrivalId: 10 }]);
    expect(ambiguous).toHaveLength(0);
  });

  // Si en un empate se sacara del ruedo solo el mejor par, el segundo quedaría
  // libre y se emparejaría "por descarte" con un tercer nodo en la vuelta
  // siguiente — decidiendo justo lo que se acaba de declarar indecidible.
  it('en un empate saca del ruedo ambos pares, no solo el mejor', () => {
    const { matches, ambiguous } = computeGreedyMatches(
      [salida(1, 0), salida(2, 1)],
      [llegada(10, 120), llegada(11, 300)],
      MARGEN_3_MIN,
    );

    expect(ambiguous).toHaveLength(1);
    // Ni el viaje 2 ni la llegada 11 se emparejan por descarte.
    expect(matches).toHaveLength(0);
  });

  it('deja huérfanas las salidas que sobran cuando hay menos llegadas', () => {
    const { matches } = computeGreedyMatches(
      [salida(1, 0), salida(2, 200)],
      [llegada(10, 260)],
      MARGEN_3_MIN,
    );

    expect(matches).toEqual([{ tripId: 2, pendingArrivalId: 10 }]);
  });

  it('deja pendientes las llegadas que sobran cuando hay menos salidas', () => {
    const { matches } = computeGreedyMatches(
      [salida(1, 0)],
      [llegada(10, 100), llegada(11, 500)],
      MARGEN_3_MIN,
    );

    expect(matches).toEqual([{ tripId: 1, pendingArrivalId: 10 }]);
  });

  it('no falla con listas vacías', () => {
    expect(computeGreedyMatches([], [], MARGEN_3_MIN)).toEqual({
      matches: [],
      ambiguous: [],
    });
    expect(computeGreedyMatches([salida(1, 0)], [], MARGEN_3_MIN).matches).toHaveLength(0);
    expect(computeGreedyMatches([], [llegada(10, 0)], MARGEN_3_MIN).matches).toHaveLength(0);
  });

  it('nunca usa dos veces la misma salida o la misma llegada', () => {
    const { matches } = computeGreedyMatches(
      [salida(1, 0), salida(2, 100), salida(3, 200)],
      [llegada(10, 50), llegada(11, 150), llegada(12, 250)],
      MARGEN_3_MIN,
    );

    expect(new Set(matches.map((m) => m.tripId)).size).toBe(matches.length);
    expect(new Set(matches.map((m) => m.pendingArrivalId)).size).toBe(matches.length);
  });
});

describe('groupBy', () => {
  it('agrupa por la clave dada conservando el orden dentro de cada grupo', () => {
    const filas = [
      { vehicleId: 1, id: 'a' },
      { vehicleId: 2, id: 'b' },
      { vehicleId: 1, id: 'c' },
    ];

    const agrupado = groupBy(filas, (f) => f.vehicleId);

    expect(agrupado.get(1)?.map((f) => f.id)).toEqual(['a', 'c']);
    expect(agrupado.get(2)?.map((f) => f.id)).toEqual(['b']);
    expect(agrupado.get(3)).toBeUndefined();
  });
});
