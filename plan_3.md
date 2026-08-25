# Plan: Emparejamiento salida↔llegada por menor diferencia de tiempo

> Este documento es de **diseño, para implementar más adelante** — no describe cambios ya hechos en el código. Reemplaza el enfoque de `plan_2.md` (ventana de tiempo derivada de `Planning.tiempoPromedioViajeMin`), que se deja en el repo como referencia histórica de por qué se llegó a este segundo diseño.

## Contexto

El sistema registra transporte de material cantera→obra: un supervisor en la **cantera** registra la **salida** de un vehículo, y un supervisor distinto en la **obra** registra su **llegada**, cada uno en su propio celular, ambos trabajando **offline** la mayor parte del tiempo. Un mismo vehículo hace varias vueltas cantera↔obra por día, y salida/llegada pueden sincronizar al servidor en cualquier orden, con horas de diferencia.

El algoritmo de emparejamiento que describe `plan_2.md` (y que ya está implementado en `backend/src/transport-log/reconciliation/`) calcula una *ventana esperada* de llegada a partir de `Planning.tiempoPromedioViajeMin` (tiempo promedio de viaje, cargado a mano en la planificación) con tolerancia fija de **-10 min / +25 min**, y solo empareja automáticamente si exactamente 1 candidato cae en esa ventana.

**Por qué se reemplaza:** en una reunión con la gerencia (2026-08-24) se identificó que los tiempos reales del negocio varían en **horas**, no minutos — espera en cantera de 1 a 4 horas (colas de carga), cola/demora al descargar en obra, almuerzo, tráfico, accidentes en la vía. Una ventana de 35 minutos totales pierde casi todos los matches reales; si se agranda para cubrir esa variación (varias horas), entonces con un vehículo haciendo varias vueltas al día las ventanas de vueltas consecutivas se solapan y la ambigüedad (`>1 candidato → revisión manual`) pasa a ser la norma, no la excepción — rompe el propósito de automatizar.

**Nuevo enfoque:** eliminar la dependencia de una ventana calculada. En su lugar, por cada vehículo, emparejar la salida y la llegada con **menor diferencia de tiempo entre sí** (siempre que la llegada sea posterior a la salida — causalidad). Esta regla:
- Es simétrica en ambas direcciones: "buscar la llegada más próxima hacia adelante" (desde una salida nueva) y "buscar la salida más reciente hacia atrás" (desde una llegada nueva) son **matemáticamente la misma regla** — minimizar el gap, visto desde cada extremo.
- Maneja correctamente el caso de una salida abandonada por avería (vehículo se rompe, queda con una salida abierta que nunca cierra; se reemplaza/repara y vuelve a salir más tarde): la llegada siguiente se empareja con la salida reciente (gap chico), no con la vieja abandonada (gap grande) — a diferencia de un FIFO puro ("la más antigua primero"), que fallaría aquí.
- No requiere ningún dato estimado de tiempo de viaje — solo el orden cronológico real de los eventos.

**Decisiones confirmadas para este diseño:**
- `Planning.tiempoPromedioViajeMin` se mantiene en el formulario como dato **informativo** (deja de determinar el emparejamiento), no se elimina.
- Margen de "empate" entre dos candidatos casi idénticos en tiempo (no se auto-resuelve, va a revisión manual): **3 minutos**.
- Umbral de "atención" — salida abierta sin llegada que se marca `PENDIENTE_EMPAREJAMIENTO` (solo aviso visual, no bloquea, se sigue intentando emparejar igual): **24 horas**.
- Dos hallazgos adyacentes detectados durante el análisis (inconsistencia del estado del QR con vueltas múltiples simultáneas; el módulo web "jefe de obra" no reconoce el estado `PENDIENTE_EMPAREJAMIENTO`) quedan **explícitamente fuera de alcance** de este plan — se resuelven aparte si se decide más adelante.

**Alcance verificado:** este cambio es **100% backend**. Se confirmó por lectura directa del código que la app móvil (`C:\Users\Sistemas\StudioProjects\CR_APP`) ya defiere todo el emparejamiento al servidor y no necesita ningún cambio. El frontend web solo necesita actualizar textos/comentarios desactualizados y una mejora opcional de UX.

---

## Parte 1 — Backend (núcleo del cambio)

Repo: `backend` (NestJS 11 + Prisma 6 + PostgreSQL).

### 1.1 Regla de selección (resumen técnico)

Por vehículo, entre el conjunto de salidas abiertas (`TransportTrip.status IN ('EN_PROGRESO','PENDIENTE_EMPAREJAMIENTO')`, sin llegada) y el conjunto de llegadas en staging (`TransportArrivalPending.status = 'PENDIENTE'`): el par válido (`llegada.capturedAt > salida.departureAt`) con **menor gap** gana. Si hay empate entre el mejor y el segundo mejor candidato (diferencia de gaps < 3 min), no se auto-resuelve.

Tres disparadores (arquitectura de triggers ya existente, se mantiene):

1. **Nueva salida sincroniza** → busca en llegadas pendientes de ese vehículo la de **menor `capturedAt`** entre las posteriores a esta salida (`ORDER BY capturedAt ASC LIMIT 2` para poder detectar empate).
2. **Nueva llegada sincroniza sin `tripId`/`departureUuid` explícito** → busca entre las salidas abiertas de ese vehículo la de **mayor `departureAt`** entre las anteriores a esta llegada (`ORDER BY departureAt DESC LIMIT 2`) — es la misma regla de menor gap, vista desde el otro lado.
3. **Job periódico (cron cada 5 min)** → recalcula el emparejamiento completo (voraz, por menor gap) entre TODAS las salidas abiertas y llegadas pendientes de cada vehículo, no solo una salida a la vez — cubre condiciones de carrera y el caso "la llegada sincronizó antes que la salida".

### 1.2 Archivo nuevo — `backend/src/transport-log/reconciliation/reconciliation.matching.ts`

Función pura, sin dependencia de Prisma/Nest (deliberado: así se puede testear sin base de datos). Implementa el matching voraz completo, usado por el sweep periódico:

```ts
export interface MatchableDeparture { tripId: number; departureAt: Date }
export interface MatchableArrival { pendingArrivalId: number; capturedAt: Date }

export interface GreedyMatchResult {
  matches: { tripId: number; pendingArrivalId: number }[];
  ambiguous: { tripId?: number; pendingArrivalId?: number; reason: string }[];
}

export function computeGreedyMatches(
  departures: MatchableDeparture[],
  arrivals: MatchableArrival[],
  tieMarginMs: number,
): GreedyMatchResult {
  const freeTrips = new Set(departures.map((d) => d.tripId));
  const freePendings = new Set(arrivals.map((a) => a.pendingArrivalId));
  const matches: GreedyMatchResult['matches'] = [];
  const ambiguous: GreedyMatchResult['ambiguous'] = [];

  while (true) {
    const candidates: { tripId: number; pendingArrivalId: number; gap: number }[] = [];
    for (const d of departures) {
      if (!freeTrips.has(d.tripId)) continue;
      for (const a of arrivals) {
        if (!freePendings.has(a.pendingArrivalId)) continue;
        const gap = a.capturedAt.getTime() - d.departureAt.getTime();
        if (gap > 0) candidates.push({ tripId: d.tripId, pendingArrivalId: a.pendingArrivalId, gap });
      }
    }
    if (candidates.length === 0) break;

    candidates.sort((x, y) => x.gap - y.gap);
    const best = candidates[0];
    const second = candidates[1];

    if (second && second.gap - best.gap < tieMarginMs) {
      // Empate real entre los dos mejores pares globales: se sacan AMBOS
      // pares del ruedo (no solo el mejor) para que un tercer nodo no le
      // "robe" por descarte su contraparte legítima en la misma pasada.
      ambiguous.push({ tripId: best.tripId, pendingArrivalId: best.pendingArrivalId, reason: 'tie' });
      freeTrips.delete(best.tripId);
      freePendings.delete(best.pendingArrivalId);
      if (second.tripId !== best.tripId) freeTrips.delete(second.tripId);
      if (second.pendingArrivalId !== best.pendingArrivalId) freePendings.delete(second.pendingArrivalId);
      continue;
    }

    matches.push({ tripId: best.tripId, pendingArrivalId: best.pendingArrivalId });
    freeTrips.delete(best.tripId);
    freePendings.delete(best.pendingArrivalId);
  }

  return { matches, ambiguous };
}
```

Con "unas pocas vueltas por día" por vehículo en la práctica, esto es trivialmente rápido (no hace falta un algoritmo de asignación óptima tipo Hungarian).

### 1.3 `backend/src/transport-log/reconciliation/reconciliation.constants.ts` — reemplazar contenido completo

```ts
/** Gap "prácticamente idéntico" entre el mejor y segundo mejor candidato:
 *  no se auto-resuelve, se deja para el siguiente sweep o revisión manual. */
export const TIE_MARGIN_MIN = 3;

/** Salida EN_PROGRESO sin llegada por más de este tiempo se marca
 *  PENDIENTE_EMPAREJAMIENTO (solo señal de atención, no terminal, se sigue
 *  intentando emparejar igual). */
export const OPEN_TRIP_ATTENTION_HOURS = 24;

/** TransportArrivalPending sin match después de este tiempo se marca
 *  EXPIRADO (solo informativo; sigue siendo emparejable a mano). */
export const PENDING_ARRIVAL_EXPIRATION_DAYS = 7;
```

Se eliminan `EARLY_TOLERANCE_MIN`, `LATE_TOLERANCE_MIN`, `LUNCH_DURATION_MIN` (ya no hay ventana que calcular).

### 1.4 `backend/src/transport-log/reconciliation/reconciliation.service.ts` — reescribir

- Eliminar `computeExpectedWindow` (líneas 40-53 del archivo actual) por completo.
- Actualizar imports: quitar `EARLY_TOLERANCE_MIN`/`LATE_TOLERANCE_MIN`/`LUNCH_DURATION_MIN`; importar `TIE_MARGIN_MIN`, `OPEN_TRIP_ATTENTION_HOURS`, `PENDING_ARRIVAL_EXPIRATION_DAYS` y `computeGreedyMatches` desde `./reconciliation.matching`.
- **`tryMatchNewDeparture(tripId)`** (líneas 62-99 del archivo actual) — reescribir:
  ```ts
  async tryMatchNewDeparture(tripId: number): Promise<void> {
    try {
      const trip = await this.prisma.transportTrip.findUnique({
        where: { id: tripId },
        select: { id: true, vehicleId: true, departureAt: true },
      });
      if (!trip) return;

      const candidates = await this.prisma.transportArrivalPending.findMany({
        where: {
          vehicleId: trip.vehicleId,
          status: 'PENDIENTE',
          capturedAt: { gt: trip.departureAt },
        },
        orderBy: { capturedAt: 'asc' },
        take: 2,
        select: { id: true, capturedAt: true },
      });

      if (candidates.length === 0) return;

      if (candidates.length === 2) {
        const gap0 = candidates[0].capturedAt.getTime() - trip.departureAt.getTime();
        const gap1 = candidates[1].capturedAt.getTime() - trip.departureAt.getTime();
        if (gap1 - gap0 < TIE_MARGIN_MIN * 60_000) {
          this.logger.warn(
            `Viaje ${tripId}: llegadas pendientes ${candidates[0].id} y ${candidates[1].id} casi empatadas, se deja para el sweep/revisión manual`,
          );
          return;
        }
      }

      await this.closeTripWithPendingArrival(tripId, candidates[0].id);
    } catch (error: any) {
      this.logger.error(`Error emparejando salida nueva (trip ${tripId}): ${error.message}`);
    }
  }
  ```
- **`closeTripWithPendingArrival(tripId, pendingArrivalId)`** (líneas 110-223 del archivo actual) — **no se toca**. Ya es agnóstica al criterio de selección: solo recibe los dos IDs ya decididos, hace el claim atómico (`updateMany WHERE status IN ('PENDIENTE','EXPIRADO')`) y el cierre transaccional. Sigue reusándose tal cual desde los 3 disparadores.
- **`runReconciliationSweep()`** (líneas 231-300 del archivo actual, cron cada 5 min) — reescribir para usar `computeGreedyMatches` por vehículo:
  ```ts
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runReconciliationSweep(): Promise<void> {
    try {
      const openTrips = await this.prisma.transportTrip.findMany({
        where: { status: { in: ['EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO'] }, arrival: null },
        select: { id: true, vehicleId: true, departureAt: true },
      });
      const pendingArrivals = await this.prisma.transportArrivalPending.findMany({
        where: { status: 'PENDIENTE' },
        select: { id: true, vehicleId: true, capturedAt: true },
      });

      const tripsByVehicle = groupBy(openTrips, (t) => t.vehicleId);
      const pendingsByVehicle = groupBy(pendingArrivals, (p) => p.vehicleId);

      for (const [vehicleId, trips] of tripsByVehicle) {
        const pendings = pendingsByVehicle.get(vehicleId);
        if (!pendings?.length) continue;

        const { matches } = computeGreedyMatches(
          trips.map((t) => ({ tripId: t.id, departureAt: t.departureAt })),
          pendings.map((p) => ({ pendingArrivalId: p.id, capturedAt: p.capturedAt })),
          TIE_MARGIN_MIN * 60_000,
        );
        for (const { tripId, pendingArrivalId } of matches) {
          // Reusa el claim atómico existente; si otro proceso ya tomó
          // alguno de los dos, closeTripWithPendingArrival simplemente no
          // cierra nada y seguimos con el resto de la pasada.
          await this.closeTripWithPendingArrival(tripId, pendingArrivalId);
        }
      }

      // Bandera de atención (reemplaza el criterio de "ventana cerrada").
      const attentionCutoff = new Date(Date.now() - OPEN_TRIP_ATTENTION_HOURS * 60 * 60 * 1000);
      const flagged = await this.prisma.transportTrip.updateMany({
        where: { status: 'EN_PROGRESO', arrival: null, departureAt: { lt: attentionCutoff } },
        data: { status: 'PENDIENTE_EMPAREJAMIENTO' as any },
      });
      if (flagged.count > 0) {
        this.logger.warn(`${flagged.count} salida(s) marcada(s) PENDIENTE_EMPAREJAMIENTO por antigüedad sin llegada`);
      }

      // Expiración informativa — sin cambios respecto al diseño anterior.
      const expirationCutoff = new Date(Date.now() - PENDING_ARRIVAL_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
      const expired = await this.prisma.transportArrivalPending.updateMany({
        where: { status: 'PENDIENTE', capturedAt: { lt: expirationCutoff } },
        data: { status: 'EXPIRADO' },
      });
      if (expired.count > 0) {
        this.logger.log(`${expired.count} llegada(s) pendiente(s) marcada(s) EXPIRADO por antigüedad`);
      }
    } catch (error: any) {
      this.logger.error(`Error en runReconciliationSweep: ${error.message}`);
    }
  }
  ```
  (`groupBy` — usar cualquier helper ya disponible en el repo, o un `reduce` simple a `Map`; no es necesario agregar una librería nueva.)
- Actualizar el comentario de cabecera del archivo, que hoy describe el criterio de ventana — dejarlo desactualizado confundiría al próximo que lo lea.

### 1.5 `backend/src/transport-log/transport-log.service.ts` — `submitArrival`, rama `qrcode`

Reemplazar el `$queryRaw` de las líneas 654-661 (verificado, dentro de la transacción de `submitArrival`, líneas 649-798):

```ts
// ANTES
const claimResult = await prisma.$queryRaw<{ id: number }[]>`
  SELECT id FROM "TransportTrip"
  WHERE "vehicleId" = ${vehicleId}
    AND status = 'EN_PROGRESO'
  ORDER BY "departureAt" ASC
  LIMIT 1
  FOR UPDATE
`;
if (claimResult.length === 0) { /* staging, líneas 663-692 */ }
tripIdToUpdate = claimResult[0].id;
```

```ts
// DESPUÉS
const claimResult = await prisma.$queryRaw<{ id: number; departureAt: Date }[]>`
  SELECT id, "departureAt" FROM "TransportTrip"
  WHERE "vehicleId" = ${vehicleId}
    AND status IN ('EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO')
    AND "departureAt" < ${capturedAt}
  ORDER BY "departureAt" DESC
  LIMIT 2
  FOR UPDATE
`;

const pendingArrivalData = {
  clientUuid,
  source: (data.source as any) || 'ONLINE',
  capturedAt,
  vehicleId,
  userId: userArrivalId,
  m3: arrivalM3,
  m3Corrected: data.arrivalM3Corrected ? parseFloat(data.arrivalM3Corrected) : null,
  lat: arrivalLat,
  lng: arrivalLng,
  abscisa: data.abscisa ? parseInt(data.abscisa) : null,
  almuerzo: this.parseBoolean(data.almuerzo),
  ...photos,
};

if (claimResult.length === 0) {
  await prisma.transportArrivalPending.create({ data: pendingArrivalData });
  pendingStaged = true;
  return null;
}

if (claimResult.length === 2) {
  const gap0 = capturedAt.getTime() - claimResult[0].departureAt.getTime();
  const gap1 = capturedAt.getTime() - claimResult[1].departureAt.getTime();
  if (gap1 - gap0 < TIE_MARGIN_MIN * 60_000) {
    // Empate real: no adivinar. Igual que "0 resultados", va a staging y se
    // resuelve por el sweep (ve el conjunto completo) o manualmente.
    await prisma.transportArrivalPending.create({ data: pendingArrivalData });
    pendingStaged = true;
    return null;
  }
}

tripIdToUpdate = claimResult[0].id;
```

Puntos clave de este cambio:
- `status IN ('EN_PROGRESO', 'PENDIENTE_EMPAREJAMIENTO')` es el cambio de fondo: hoy una salida ya marcada `PENDIENTE_EMPAREJAMIENTO` es invisible a este disparador (bug del diseño actual) — con el nuevo diseño vuelve a ser candidata normal, coherente con que ese estado nunca fue terminal.
- El bloque `pendingArrivalData` se extrae una sola vez (antes se construía inline solo en la rama de 0 resultados) para reusarlo también en la rama de empate, sin duplicar los ~12 campos.
- Las ramas por `departureUuid` (líneas 541-568) y `tripId` explícito (569-587) **no se tocan** — resolución exacta sin ambigüedad, sin relación con este cambio.
- Importar `TIE_MARGIN_MIN` desde `./reconciliation/reconciliation.constants`.

`getByQrCode` (el `findFirst` que decide qué pantalla mostrar al escanear) **no se toca** — es un shim de UI marcado como temporal en su propio comentario, no participa en el emparejamiento real de datos.

### 1.6 `backend/prisma/schema.prisma`

**Sin migración de base de datos.** No se agregan columnas, tablas ni enums. Los índices existentes ya sirven para las nuevas queries:
- `TransportTrip` → `@@index([vehicleId, status, departureAt])`: cubre igualdad en `vehicleId`+`status`, rango+orden en `departureAt` (btree es bidireccional, sirve para `ASC` y `DESC`).
- `TransportArrivalPending` → `@@index([vehicleId, status, capturedAt])`: misma forma para la query del lado de las llegadas.

Solo se actualizan comentarios `///` (no generan SQL, no requieren migración):
- `Planning.tiempoPromedioViajeMin`: ya no es "el único campo que usa el algoritmo de reconciliación" — se mantiene el campo, se corrige el comentario.
- `TransportTrip.almuerzoAplicado`: el comentario menciona "restar 1h al calcular la ventana" — ya no aplica (el campo se sigue usando igual que hoy, solo como dato informativo del viaje, no para matching).
- Enum `TransportStatus.PENDIENTE_EMPAREJAMIENTO`: el comentario decía "ventana esperada cerrada" → pasa a "abierta más de `OPEN_TRIP_ATTENTION_HOURS` sin llegada".

### 1.7 Controlador y DTOs — sin cambios

`backend/src/transport-log/transport-log.controller.ts`: `GET /transport/pending-arrivals`, `GET /transport/unmatched-departures`, `POST /transport/manual-match`, `PATCH /transport/:id/reassign` siguen funcionando igual — consultan por `status`, que sigue existiendo con la misma semántica. `ManualMatchDto`/`ReassignTripDto` no referencian ventana ni tiempo de viaje.

### 1.8 Tests a agregar (hoy no hay cobertura real de esta lógica)

`transport-log.service.spec.ts` y `transport-log.controller.spec.ts` son stubs vacíos ("should be defined"); no existe spec de `reconciliation`. Se recomienda:

- **`reconciliation.matching.spec.ts`** (nuevo, prioridad alta) — unitario puro sobre `computeGreedyMatches`, sin mocks de Prisma:
  - Caso base: 1 salida + 1 llegada posterior → 1 match.
  - Vueltas múltiples normales: 3 salidas + 3 llegadas intercaladas → verificar que se arman los 3 pares por menor gap, no por orden de inserción (demuestra que NO es FIFO puro).
  - Salida abandonada: 1 salida vieja + 1 salida reciente + 1 llegada que calza con la reciente → la llegada se empareja con la reciente, la vieja queda huérfana.
  - Causalidad: llegada anterior a la salida (gap negativo) → nunca es candidata.
  - Empate: dos llegadas con gaps dentro de `TIE_MARGIN_MIN` contra la misma salida → ninguna se empareja.
  - Empate en cascada: verificar que se sacan ambos lados de ambos pares, no que un tercer nodo "roba" la pareja por descarte.
- **`reconciliation.service.spec.ts`** (nuevo, prioridad media) — con `PrismaService` mockeado: `tryMatchNewDeparture` (candidato único / 0 candidatos / empate / error interno no debe propagar); `runReconciliationSweep` (agrupa por vehículo sin cruzar vehículos; marca `PENDIENTE_EMPAREJAMIENTO` solo tras el umbral; marca `EXPIRADO` solo tras el umbral).
- **Extender `transport-log.service.spec.ts`** (prioridad media) para `submitArrival`/rama qrcode: sin salida abierta → staging (regresión); una salida válida → empareja directo; dos salidas no empatadas → toma la más reciente; dos empatadas → va a staging; confirmar que `PENDIENTE_EMPAREJAMIENTO` ahora SÍ es candidato (regresión del bug actual).

---

## Parte 2 — Frontend web (solo texto + una mejora opcional)

Repo: `frontend` (React + TS + Vite). Confirmado por búsqueda exhaustiva: `tiempoPromedioViajeMin`/`distanciaAproximadaKm` solo se usan en el módulo `planificacion` — ningún dashboard ni reporte los consume.

### 2.1 `frontend/src/modules/planificacion/components/PlanificacionForm.tsx`

`helperText` del campo "Tiempo promedio de viaje (horas, opcional)":
- Antes: `"Ej: 2.33 para 2h20. Se usa para emparejar automáticamente las salidas con sus llegadas."`
- Después: `"Ej: 2.33 para 2h20. Informativa: el sistema empareja automáticamente por menor diferencia de tiempo entre salida y llegada, ya no usa este dato."`

`distanciaAproximadaKm` no cambia — su helper text ya es correcto.

### 2.2 `frontend/src/modules/planificacion/types/index.ts`

JSDoc de `tiempoPromedioViajeMin` en `Planificacion`:
- Antes: `/** Minutos. Único campo que usa el algoritmo de reconciliación del backend. */`
- Después: `/** Minutos. Informativa: el algoritmo de reconciliación empareja por menor diferencia de tiempo, ya no depende de este campo. */`

`planificacionService.ts` (helper `horasAMinutos` y los 3 bloques que appendean/asignan `tiempoPromedioViajeMin`) y `usePlanificaciones.ts` **no cambian** — el campo se sigue capturando y guardando igual (decisión: se mantiene como informativo).

### 2.3 `frontend/src/modules/registro-transporte/types/index.ts`

Comentario de `PENDIENTE_EMPAREJAMIENTO` en el union `TransportStatus`:
- Antes: `/** Salida cuya ventana esperada de llegada cerró sin match automático. */`
- Después: `/** Salida EN_PROGRESO abierta más de 24h sin llegada que la empareje (el emparejamiento es por menor diferencia de tiempo, no por ventana calculada). */`

### 2.4 `frontend/src/modules/registro-transporte/components/TransportePlanForm.tsx`

Mismo comentario desactualizado en el `assignedVehicles` memo — actualizar el texto de la misma forma. El código que sigue no cambia: sigue siendo correcto tratar `PENDIENTE_EMPAREJAMIENTO` como "viaje abierto".

### 2.5 `frontend/src/modules/registro-transporte/components/ConciliacionPanel.tsx`

Copy explicativo — actualizar para reflejar que ahora debería tener pocos casos (solo anomalías genuinas: avería, offline prolongado, empate real), no ambigüedad rutinaria como antes.

**Mejora recomendada (opcional, sin cambios de backend):** mostrar la diferencia de tiempo (gap) entre la salida seleccionada y cada llegada candidata, para que el ADMIN pueda reproducir a mano el mismo criterio que usa el algoritmo automático. Ambos datos ya están disponibles en los payloads existentes (`TransportLog.departureAt` vía `getUnmatchedDepartures`, `PendingArrivalRow.capturedAt` vía `getPendingArrivals`) — no requiere ningún endpoint nuevo. Formatear como `"Δ 1h 42min"` (reusar/adaptar el patrón de duración ya usado en `TransportLogPage.tsx`), y ordenar la lista de candidatos por gap ascendente cuando hay una selección activa.

### Fuera de alcance (decidido explícitamente)

- Fix de `VehicleQRCode.status` con vueltas múltiples simultáneas (hoy puede mostrarse "Disponible" aunque el vehículo tenga otra vuelta abierta).
- Fix del módulo `registro-transporte-jefe` (no reconoce `PENDIENTE_EMPAREJAMIENTO`).

---

## Parte 3 — App móvil: sin cambios

Confirmado por lectura directa del código (`CR_APP`, repo separado) que **no se requiere ningún cambio funcional**:

- `ElegirRegistro.kt` (rama `"OBRA"` de `manejarNavegacion()`): ya nunca bloquea el registro de una llegada por falta de match — solo bloquea si no identifica el vehículo.
- `RegistroLlegada.kt`: el aviso de "sin match" ya es no bloqueante (`TextView`, no diálogo).
- `data/remote/Network.kt` (`registerArrival`): `qrcode` y `departureUuid` ya son opcionales en el payload.
- `sync/SyncWorker.kt`: ya envía llegadas sin `departureUuid` sin esperar nada.
- No existe en la app ningún cálculo de tiempo de viaje, distancia ni ventana — el "matching" local (`PendingDataDao.findUnsyncedDepartureByQr`) es puramente cosmético (pre-llenado de UI), nunca se envía al servidor como parte de una decisión.

El nuevo criterio del backend usa exactamente los mismos datos que la app ya envía (`vehicleId`/`qrcode`, `capturedAt`) — ningún campo nuevo, ningún endpoint nuevo, ningún cambio de payload.

---

## Verificación end-to-end (para cuando se implemente)

1. **Backend — unitarios**: correr los tests nuevos de la sección 1.8 (`reconciliation.matching.spec.ts` en particular, por ser lógica pura fácil de cubrir exhaustivamente).
2. **Backend — dry-run contra datos reales**: antes de desplegar, correr el nuevo `computeGreedyMatches` en modo solo-lectura (loguear qué emparejaría, sin llamar `closeTripWithPendingArrival`) contra el estado actual de `TransportTrip`/`TransportArrivalPending` en staging/producción, y comparar 10-20 casos contra lo que el ADMIN ya emparejó a mano bajo el algoritmo viejo.
3. **Backend — escenario de avería de punta a punta** (el caso que más le costaba al diseño anterior): crear una salida, dejarla sin llegada, crear una segunda salida del mismo vehículo más tarde, registrar una llegada que corresponde a la segunda — confirmar que empareja con la segunda y la primera queda visible en `GET /transport/unmatched-departures`.
4. **Backend — condición de carrera**: dos requests casi simultáneos (nueva salida + nueva llegada del mismo vehículo) — confirmar que no se corrompen entre sí (protegido por las transacciones/`FOR UPDATE` ya existentes, sin cambios en ese mecanismo).
5. **Frontend**: cargar una planificación con y sin `tiempoPromedioViajeMin`, confirmar que el emparejamiento automático funciona igual en ambos casos (ya no depende de ese campo); abrir el panel de conciliación y confirmar que el copy actualizado se ve bien y (si se implementa la mejora opcional) que el gap se calcula y ordena correctamente.
6. **Móvil**: sin cambios de código, pero vale la pena una prueba manual en modo avión (escanear QR de llegada de un vehículo sin salida conocida localmente) para reconfirmar que el flujo actual sigue funcionando sin bloqueos, ahora que el servidor resuelve con el nuevo criterio.
7. **Monitoreo post-despliegue**: revisar logs del cron (`runReconciliationSweep`) el primer día — contar cuántas veces se dispara la rama de empate (`ambiguous`); si aparece con frecuencia inesperada, revisar si `TIE_MARGIN_MIN` necesita ajuste o si hay un patrón real de doble-escaneo que valga la pena resolver en la app.

## Riesgos identificados

- Un trip `PENDIENTE_EMPAREJAMIENTO` pasa a ser candidato visible para el escaneo directo por QR (antes no lo era) — verificar que ninguna otra parte del sistema asuma que ese estado es "intocable".
- `TIE_MARGIN_MIN=3min` y `OPEN_TRIP_ATTENTION_HOURS=24h` son valores de partida razonables pero sin dato histórico real detrás — revisar con datos de producción tras el despliegue y ajustar si hace falta.
- Al extraer `pendingArrivalData` para reusarlo en dos ramas (sección 1.5), verificar con cuidado que ambas rutas conserven exactamente los mismos campos (`m3Corrected`, `abscisa`, fotos, etc.) que el bloque original.
