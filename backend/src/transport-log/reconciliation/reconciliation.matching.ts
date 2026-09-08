/**
 * Criterio de emparejamiento salida↔llegada: menor diferencia de tiempo.
 *
 * Reemplaza al criterio de ventana (salida + tiempoPromedioViajeMin, con
 * tolerancia fija de -10/+25 min). La ventana se descartó porque los tiempos
 * reales del negocio varían en HORAS, no en minutos: espera de 1 a 4 h en la
 * cantera por la cola de carga, demora al descargar en obra, almuerzo, tráfico.
 * Una ventana de 35 minutos pierde casi todos los emparejamientos reales; y si
 * se agranda para cubrir esa variación, con un vehículo dando varias vueltas al
 * día las ventanas de vueltas consecutivas se solapan y la ambigüedad pasa a
 * ser la norma — que es lo contrario de automatizar.
 *
 * La regla nueva no necesita ningún tiempo estimado, solo el orden cronológico
 * real de los eventos, y es simétrica: "la llegada más próxima hacia adelante"
 * (visto desde una salida) y "la salida más reciente hacia atrás" (visto desde
 * una llegada) son la misma regla.
 *
 * Sin dependencias de Prisma ni de Nest a propósito: así se puede probar
 * exhaustivamente sin base de datos.
 */

export interface MatchableDeparture {
  tripId: number;
  departureAt: Date;
}

export interface MatchableArrival {
  pendingArrivalId: number;
  capturedAt: Date;
}

export interface GreedyMatchResult {
  matches: { tripId: number; pendingArrivalId: number }[];
  /** Pares que no se auto-resuelven por estar empatados; van a revisión manual. */
  ambiguous: { tripId: number; pendingArrivalId: number; reason: string }[];
}

/**
 * Empareja voraz por menor gap. En cada pasada toma el mejor par global
 * disponible, lo saca del ruedo, y repite.
 *
 * Reglas:
 * - Causalidad: solo son candidatos los pares con `llegada > salida`. Un
 *   vehículo no puede llegar antes de salir.
 * - Techo: tampoco son candidatos los pares separados por más de `maxGapMs`.
 *   Sin este límite, una salida vieja que quedó abierta era la única candidata
 *   del vehículo y el motor la emparejaba con una llegada de días después.
 * - Empate: si el mejor y el segundo mejor par difieren en menos de
 *   `tieMarginMs`, no se adivina — ninguno se empareja automáticamente.
 *
 * Con unas pocas vueltas por vehículo al día, el costo cuadrático es
 * irrelevante; no hace falta un algoritmo de asignación óptima.
 */
export function computeGreedyMatches(
  departures: MatchableDeparture[],
  arrivals: MatchableArrival[],
  tieMarginMs: number,
  maxGapMs: number,
): GreedyMatchResult {
  const freeTrips = new Set(departures.map((d) => d.tripId));
  const freePendings = new Set(arrivals.map((a) => a.pendingArrivalId));
  const matches: GreedyMatchResult['matches'] = [];
  const ambiguous: GreedyMatchResult['ambiguous'] = [];

  for (;;) {
    const candidates: {
      tripId: number;
      pendingArrivalId: number;
      gap: number;
    }[] = [];

    for (const d of departures) {
      if (!freeTrips.has(d.tripId)) continue;
      for (const a of arrivals) {
        if (!freePendings.has(a.pendingArrivalId)) continue;
        const gap = a.capturedAt.getTime() - d.departureAt.getTime();
        if (gap > 0 && gap <= maxGapMs) {
          candidates.push({
            tripId: d.tripId,
            pendingArrivalId: a.pendingArrivalId,
            gap,
          });
        }
      }
    }

    if (candidates.length === 0) break;

    candidates.sort((x, y) => x.gap - y.gap);
    const best = candidates[0];

    // El rival del mejor par es el mejor candidato que COMPITE con él: el que
    // le disputa la misma salida o la misma llegada. No basta con mirar el
    // segundo mejor par global — un vehículo que hace vueltas parejas produce
    // varios pares con gaps casi idénticos, pero disjuntos entre sí (salidas y
    // llegadas distintas), y esos no se estorban: son todos correctos a la vez.
    // Tratarlos como empate dejaría sin emparejar el día entero de un camión
    // con ruta regular, que es el caso más común de todos.
    const rival = candidates.find(
      (c) =>
        c !== best &&
        (c.tripId === best.tripId ||
          c.pendingArrivalId === best.pendingArrivalId),
    );

    if (rival && rival.gap - best.gap < tieMarginMs) {
      // Empate real: dos respuestas igual de plausibles para la misma pregunta.
      // Se sacan del ruedo AMBOS pares, no solo el mejor. Si se sacara solo el
      // mejor, el rival quedaría libre y en la vuelta siguiente se emparejaría
      // "por descarte" con un tercer nodo — decidiendo justo lo que acabamos de
      // declarar indecidible.
      ambiguous.push({
        tripId: best.tripId,
        pendingArrivalId: best.pendingArrivalId,
        reason: 'tie',
      });
      freeTrips.delete(best.tripId);
      freePendings.delete(best.pendingArrivalId);
      freeTrips.delete(rival.tripId);
      freePendings.delete(rival.pendingArrivalId);
      continue;
    }

    matches.push({ tripId: best.tripId, pendingArrivalId: best.pendingArrivalId });
    freeTrips.delete(best.tripId);
    freePendings.delete(best.pendingArrivalId);
  }

  return { matches, ambiguous };
}

/** Agrupa por una clave, sin traer una librería nueva solo para esto. */
export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
