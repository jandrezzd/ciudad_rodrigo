# Plan: vehículo en varias planificaciones, con la planificación elegida al escanear

## Contexto

**Escenario.** Un vehículo trabaja en la planificación 1 (cantera A → obra B). Se crea la planificación 2 (cantera C → obra D) y, sobre la marcha, se manda ese vehículo a C → D. Las obras y canteras pueden no tener internet.

**Hoy pasa esto:**
- La web **impide** tener el vehículo en dos planificaciones ("Vehículo ocupado… primero quítalo de la otra").
- La app guarda **solo la primera** planificación del vehículo. Si el catálogo está desactualizado o el vehículo está en dos, la salida queda en la planificación vieja: obra B, stock descontado de la cantera A.
- La llegada **no guarda planificación**. Se empareja solo por vehículo y hora, y el filtro de pendientes la ubica por las planificaciones del vehículo.

**Decisión acordada con el usuario:**
- Permitir el vehículo en **varias planificaciones**.
- Al escanear, si el vehículo está en más de una, el supervisor **elige el código de planificación**. Lo hacen tanto el de cantera (salida) como el de obra (llegada), sin internet, desde el catálogo del celular.
- Al elegir se rellenan cliente, obra y cantera.
- Cada salida y cada llegada queda en la base con su `planningId` (columnas nuevas, opcionales), para identificarlas siempre y no perder ninguna.

**Errores humanos:** si la cantera o la obra eligen mal la planificación, el ADMIN la **corrige desde la web**, en Pendientes o en el detalle del viaje. Al quedar compatibles, se emparejan solas (ver 1.8 y 2.3).

**Principios:**
- **Nunca se rechaza un registro de la app.** Si la planificación no cuadra, se guarda igual y se marca para revisión.
- **Columnas nuevas nullable.** Los registros existentes quedan con el campo vacío y siguen funcionando como hoy.
- **APK viejos.** Se siguen aceptando las salidas y llegadas que no mandan planificación.
- **Orden de despliegue:** primero el backend con su migración, después la web, y al final el APK.

---

## 1. Backend (`backend/`, solo `sct_qa` local)

### 1.1 Esquema y migración
**`prisma/schema.prisma`:**
- `TransportArrival`: `planningId Int?`, relación `planning Planning?` con `onDelete: SetNull` y `@@index([planningId])`.
- `TransportArrivalPending`: lo mismo.
- `Planning`: relaciones inversas `arrivals TransportArrival[]` y `pendingArrivals TransportArrivalPending[]`.

**Migración nueva** `migrations/2026101612xxxx_arrival_planning/migration.sql`:
- `ADD COLUMN "planningId" INTEGER` en las dos tablas;
- índices;
- FK con `ON DELETE SET NULL ON UPDATE CASCADE`, igual que `20261013120000_venta_transportista`.

**Aplicación en local:**
1. `db push --skip-generate`.
2. `migrate resolve --applied`.
3. `prisma generate`.

Nunca usar shadow DB ni `migrate dev`. Si `generate` da EPERM, el usuario detiene su servidor.

### 1.2 Planificaciones: permitir el vehículo en varias
**`src/plannings/plannings.service.ts`:** quitar la regla "ya está asignado a otra planificación" en sus tres sitios:
- `create` (~217-227);
- `update` (~490-500);
- `addVehicle` (~690-700).

Se mantiene todo lo demás. Al completar, cancelar o eliminar una planificación se siguen liberando **sus** asignaciones (`shouldReleaseVehicles`, `remove`), sin tocar las de otras planificaciones.

### 1.3 Catálogo y escaneo
**`getCatalog`** (`transport-log.service.ts` ~2418), en `vehicles[].plannings`:
- devolver solo las planificaciones **activas**: `isActive` y estado distinto de `COMPLETADO` o `CANCELADO`, el mismo criterio que ya usa la web para "ocupados";
- incluir `{ id, planningCode, constSiteId }`;
- orden: `startDate` descendente.

**`getByQrCode`** (~110): agregar `plannings` (mismo formato) a `vehiclePayload`, para el escaneo con internet.

### 1.4 Salida (`submitDeparture`, ~161)
- **Si viene `planningId` y el vehículo NO está en esa planificación:** no se rechaza. Se usa igual y se agrega el motivo "Vehículo no asignado a la planificación PLAN-X". El registro manual web sigue igual.
- **Si no viene `planningId`** (APK viejo):
  - el respaldo `planningVehicle.findFirst` pasa a **filtrar las planificaciones activas** y a ordenar por la más reciente;
  - si el vehículo está en más de una activa, se agrega el motivo "Vehículo en varias planificaciones: se usó PLAN-X".

### 1.5 Llegada (`submitArrival`, ~634)
**DTO** `DTOs/submit-arrival.dto.ts`: `planningId?` (`@IsOptional() @IsNumberString()`). Es obligatorio porque la validación usa `forbidNonWhitelisted`.

**Planificación recibida:**
- Se lee con `idPositivo`.
- Si no existe, queda `null` y se agrega un motivo.
- Si existe pero el vehículo no está en ella, se guarda igual con motivo.

**Se guarda en:**
- `pendingArrivalData` (~888);
- la creación de `arrival` (~1123).

**Regla de compatibilidad para emparejar automáticamente:**
- Una salida y una llegada son compatibles si **alguna de las dos no tiene planificación, o si son la misma**.
- Si las dos tienen planificación y son **distintas**, el automático **no** las une. Quedan en "Pendientes de emparejar" para que un ADMIN las empareje a mano.
- Aplicarla:
  - en la consulta de candidatos de la transacción (~964-976): agregar `AND ("planningId" IS NULL OR "planningId" = ${planningLlegada})` cuando la llegada trae planificación;
  - en la rama `departureUuid` (`motivoParaNoUsarViaje` ~2054): si el viaje enlazado es de otra planificación, se usa igual (el enlace explícito manda) y se agrega el motivo "Llegada registrada en PLAN-Y, salida en PLAN-X".

### 1.6 Motor de emparejamiento (`src/transport-log/reconciliation/`)
- **`candidatoPorVentana` y `candidatoPorMenorGap`** (`reconciliation.service.ts` ~112, ~158): filtrar las llegadas pendientes con la misma regla de compatibilidad contra `trip.planningId`.
- **Barrido por menor diferencia** (~515-604): al agrupar por vehículo, excluir los pares incompatibles antes de `computeGreedyMatches`. Sin cambiar la función pura: se le pasan solo pares compatibles. Si hace falta, se filtra por grupo `(vehicleId, planningId)`.
- **`closeTripWithPendingArrival`** (~342-362): copiar `planningId` de la llegada pendiente a `TransportArrival`.
- **`manualMatch`:** sin cambios. El ADMIN puede emparejar entre planificaciones, por ejemplo un vehículo de reemplazo.

### 1.7 Pendientes para la web
**`getPendingArrivals`** (~1589): devolver `planningId` y `planning: { id, planningCode, obra }` **de la llegada**. Se mantiene `plannings` del vehículo como respaldo para las llegadas viejas sin planificación.

### 1.8 Corregir la planificación (errores humanos), solo ADMIN
**Caso:** la cantera eligió la planificación 1 cuando era la 2, y la obra eligió bien la 2. La salida y la llegada no se emparejan solas porque son incompatibles, y quedan en Pendientes. El ADMIN corrige y se emparejan.

**Salida o viaje:** `PATCH /transport/:id/planning` con `{ planningId, reason }`. DTO nuevo `ChangeTripPlanningDto`; `reason` es obligatorio, mínimo 3 caracteres. En una sola transacción:
1. **Validar:** la planificación existe y está activa. Si el vehículo no está en ella, se permite igual y se deja el motivo en la auditoría.
2. **Actualizar el viaje:** `planningId`, `clientId` y `constSiteId` toman los valores de la nueva planificación. Si el viaje ya tiene llegada, también `arrival.planningId`.
3. **Cantera:** `resolverCantera({ planningId: nuevo, vehicleId })`.
4. **Stock**, reutilizando `cantera-stock.service.ts`:
   - Si hay movimiento y la nueva cantera es otra: `reubicarConsumoPorMaterial` con la nueva cantera y el material del viaje. Si la cantera no tiene ese material, falla con mensaje claro, igual que hoy.
   - Si no había movimiento y ahora hay cantera y material: `registrarConsumo`.
   - Si la nueva planificación no resuelve cantera: el consumo se deja como está y se avisa en la respuesta.
5. **Auditoría:** el mismo patrón que `reassignTrip` (~2278): "Planificación corregida de PLAN-X a PLAN-Y por <usuario>: <motivo>".
6. **Emparejamiento:** después de confirmar, `reconciliationService.tryMatchNewDeparture(tripId)`, para que se una sola con la llegada correcta.

**Llegada pendiente:** `PATCH /transport/pending-arrival/:id/planning` con `{ planningId, reason }`:
- actualiza `TransportArrivalPending.planningId` y registra la auditoría en `motivoRevision`;
- dispara `runReconciliationSweep`, como ya hace `createPendingArrival`.

**Ayuda para emparejar:** en `getUnmatchedDepartures` y `getPendingArrivals` agregar `posiblePareja`:
- es la contraparte sin emparejar del **mismo vehículo**, de **otra planificación**, dentro de `MAX_MATCH_GAP_HOURS`;
- devuelve `{ id, planningCode, hora }`;
- sirve para que la web avise "Posible pareja en PLAN-X".

### 1.9 Pruebas (`transport-log.service.spec.ts`, `reconciliation.*.spec.ts`, `plannings.service.spec.ts`)
- Crear y editar una planificación con un vehículo que ya está en otra **no falla**.
- **Salida:**
  - con `planningId` se guarda esa planificación;
  - con un vehículo fuera de esa planificación se guarda con motivo;
  - sin `planningId` y con dos planificaciones activas, toma la más reciente y deja motivo.
- **Llegada:**
  - `planningId` se guarda en la pendiente y en la emparejada;
  - con la misma planificación se empareja sola;
  - con una planificación distinta queda pendiente;
  - sin planificación (APK viejo) se empareja como hoy.
- **Barrido:** no une pares de planificaciones distintas.
- **Corregir la planificación de un viaje:**
  - cambian el cliente, la obra y la cantera;
  - el consumo pasa a la nueva cantera;
  - después se empareja solo con la llegada de esa planificación.
- **Corregir la planificación de una llegada:** se empareja en el barrido.
- **Sin rol ADMIN:** 403.
- **Base de comparación:** las suites de `transport-log`, `ventas` y `plannings` en verde, salvo los fallos de inyección de dependencias que ya existen.

---

## 2. Frontend web (`frontend/src/`)

### 2.1 Permitir el vehículo en varias planificaciones
**`modules/planificacion/components/PlanificacionForm.tsx`** (~85-103) **y `registro-transporte/components/TransportePlanForm.tsx`** (~112-128):
- `occupiedByVehicle` pasa de 1 vehículo → 1 planificación a 1 vehículo → **lista** de planificaciones;
- hoy la última sobrescribe a las anteriores.

**`modules/planificacion/components/VehicleSelector.tsx`:**
- La etiqueta "Ocupado" pasa a **"También en: PLAN-0002 · Pedro Velez"**, con todas las planificaciones si son varias.
- Al hacer clic se muestra un modal de **confirmación** en lugar de un bloqueo: "Este vehículo ya trabaja en PLAN-X (obra). ¿Agregarlo también a esta planificación? Al escanearlo, el supervisor elegirá a cuál pertenece cada viaje." Botones: Cancelar / Agregar también.
- El contador pasa de "N ocupados" a "N en otras planificaciones".

### 2.2 Pendientes de emparejar (`registro-transporte/components/ConciliacionPanel.tsx`)
- **Filtro de llegadas:** si la llegada tiene `planningId`, se usa **esa**. Si no (registros viejos), se usan las planificaciones del vehículo, como hoy.
- **Opciones del filtro:** se agregan las planificaciones de las llegadas.
- **Fila de llegada:** mostrar "PLAN-0004-2026 · obra". Si no tiene, "Sin planificación (según vehículo: …)".
- **Tipo** `PendingArrivalRow` (`registro-transporte/types/index.ts`): `planningId?` y `planning?`.

### 2.3 Corregir la planificación desde la web
**Componente nuevo** `registro-transporte/components/CambiarPlanificacionModal.tsx`:
- `SearchableSelect` con las planificaciones **activas**: "PLAN-0004-2026 · obra". Arriba van las del vehículo.
- Campo "Motivo", obligatorio.
- Confirmar.
- Servicio: `transportLogService.cambiarPlanificacionViaje(id, data)` y `cambiarPlanificacionLlegada(id, data)`.

**En "Pendientes de emparejar"** (`ConciliacionPanel.tsx`):
- En cada salida y cada llegada, una acción **"Cambiar planificación"** que abre el modal. Al guardar se recarga la lista; si quedaron compatibles, el emparejamiento automático las une.
- Aviso **"Posible pareja en PLAN-X"** cuando el backend devuelve `posiblePareja`. Así se ve enseguida que la cantera o la obra eligió mal.

**En el detalle del viaje** (`TransportLogPage.tsx`): botón **"Cambiar planificación"** (solo ADMIN), con el mismo modal, también para viajes ya emparejados.

### 2.4 Detalle del viaje (`TransportLogPage.tsx` ~1556 y `TransportLogJefePage.tsx` ~1090)
- En el bloque "Llegada": mostrar la planificación con que se registró la llegada.
- Si difiere de la del viaje, mostrarla con aviso ámbar.
- Tipo: `arrival.planningId` y `arrival.planning`.

**Verificación:** typecheck sin errores nuevos (base 25) y build.

---

## 3. App Android (`CR_APP/app/src/main`, el usuario compila)

### 3.1 Base local (Room), v12 → v13
**`data/local/AppDatabase.kt`:** `version = 13` y `MIGRATION_11_12` se mantiene. `MIGRATION_12_13`:
- `CREATE TABLE IF NOT EXISTS cached_vehicle_planning (vehicleId INTEGER NOT NULL, planningId INTEGER NOT NULL, PRIMARY KEY(vehicleId, planningId))`;
- `ALTER TABLE pending_arrival ADD COLUMN planningId INTEGER`.

Agregarla a `.addMigrations(...)`. Sin ella, `fallbackToDestructiveMigration` borraría los pendientes.

**Entidades:**
- Nueva `entities/CachedVehiclePlanning.kt`.
- `PendingArrival` agrega `planningId: Int? = null` al final.
- Registrar la entidad nueva en `@Database(entities=…)`.

### 3.2 Catálogo
- **`data/remote/Network.kt`:** `CatalogPlanningRef` agrega `constSiteId: Int? = null`. `VehicleData` agrega `plannings: List<CatalogPlanningRef> = emptyList()` para el escaneo con internet. `TransportLogData` agrega `planningId: Int? = null`.
- **`data/repo/CatalogRepository.kt`:**
  - llenar `cached_vehicle_planning` con **todas** las `v.plannings`, dentro de la misma transacción `clear + insert` (~121-145);
  - `CachedVehicle.planningId` se mantiene con la primera, por compatibilidad.
- **`data/local/dao/CatalogDao.kt`:**
  - `planningsDeVehiculo(vehicleId)`: `SELECT p.* FROM cached_planning p JOIN cached_vehicle_planning vp ON vp.planningId = p.id WHERE vp.vehicleId = :vehicleId ORDER BY p.id DESC`;
  - `clearVehiclePlannings` e `insertVehiclePlannings`.
- **Funciona sin internet:** las planificaciones salen de `cached_planning`, que ya existe y se descarga completo.

### 3.3 Registro de salida (`RegistroSalida.kt` + `activity_registro_salida.xml`)
**Layout:** en la tarjeta "DATOS DEL TRANSPORTE", antes de `tvCantera`, un bloque `llPlanificacion` (`gone`) con la etiqueta "Planificación" y un `TextInputLayout` ExposedDropdown con `actvPlanificacion` (`inputType="none"`, como el de transportista en ventas).

**`inicializarTextos`** (~487-518), con la lista desde `planningsDeVehiculo(vehicleId)`. Si la caché está vacía, se usa `vehicleData.plannings` o `vehicleData.planningId`:
- **0 o 1 planificación:** igual que hoy, sin selector. Se muestra "Planificación: PLAN-…" como texto.
- **2 o más:** se muestra el selector **sin preselección**, con opciones `PLAN-0004-2026 · Obra`, y Guardar queda bloqueado hasta elegir.

**Al elegir** (función `aplicarPlanificacion(planningId)`, que reutiliza la lógica actual):
- `findCanteraIdForVehicle` → `canteraIdAuto` y `tvCantera`;
- `findPlanningById` → `clientIdAuto`, `siteIdAuto` y `tvDestino`;
- `planningSeleccionadoId`.

**Guardar:** `PendingDeparture.planningId = planningSeleccionadoId ?: vehicleData.planningId`.

**Validación:**
- `actualizarEstadoBotonEnviar`: si hay varias planificaciones, exigir la selección;
- al guardar: diálogo "Planificación requerida".

**Estado:** guardar y restaurar `planningSeleccionadoId` en `onSaveInstanceState`.

### 3.4 Registro de llegada (`RegistroLlegada.kt` + `activity_registro_llegada.xml`)
- **Layout:** el mismo bloque `llPlanificacion` en "DATOS DEL TRANSPORTE".
- **Lista:** igual que en la salida, por `vehicleId` (`logData.vehicle.id`).
- **Preselección:** si la llegada viene enlazada a una salida conocida (`logData.planningId` del viaje abierto o de la salida local, ver 3.5) y esa planificación está en la lista, se **preselecciona**. El supervisor puede cambiarla.
- **Con varias planificaciones y sin preselección:** es obligatorio elegir.
- **Guardar:** `PendingArrival.planningId`.
- **Estado:** guardar y restaurar la selección.
- **Corrección incluida** (ya detectada, mismo archivo): la extensión vacía `MutableMap.putAll(HashMap<*,*>)` (~770) borra las rutas de fotos al restaurar. Se elimina y se restaura con `rutasFotos.putAll(it as Map<Int, String>)`.

### 3.5 Escaneo (`ElegirRegistro.kt`)
- **Sin internet, OBRA con salida local** (~170-180): en `TransportLogData` va `planningId = localDeparture.planningId`, para que la llegada se preseleccione con lo que eligió la cantera.
- **Viaje abierto en caché** (`findOpenTripForVehicle`): el JSON del servidor ya trae `planningId` (`flattenTrip`).

### 3.6 Envío (`sync/SyncWorker.kt` + `Network.kt registerArrival`)
- `registerArrival` agrega `@Part("planningId") planningId: RequestBody?`.
- SyncWorker (~345) lo envía si no es null.
- La salida ya envía `planningId` (~112-117, 164): sin cambios.

---

## 4. Orden de despliegue y operación
1. **Backend en producción:** migración (`prisma migrate deploy` o el flujo del usuario) y `pm2 restart`. Acepta llegadas con y sin `planningId`.
2. **Web:** desde aquí se puede asignar el vehículo a dos planificaciones.
3. **APK nuevo.** Cada celular debe **sincronizar una vez con internet** después de instalarlo y después de crear o editar planificaciones, para bajar todas las planificaciones de cada vehículo.
4. **Mientras haya APK viejos:** las salidas sin planificación toman la más reciente (con motivo) y las llegadas sin planificación se emparejan como hoy.

---

## 5. Verificación
- **Backend:**
  - `tsc` limpio y jest de `transport-log`, `plannings` y `reconciliation`;
  - E2E en una instancia local en otro puerto: dos planificaciones con el mismo vehículo;
    - salida con `planningId=2` y llegada con `planningId=2`: emparejadas, con `arrival.planningId=2`;
    - llegada con `planningId=1`: queda pendiente;
    - salida y llegada sin `planningId` (APK viejo): funcionan;
  - limpiar los datos de prueba al final.
- **Web:**
  - en el navegador (Playwright local): agregar un vehículo de otra planificación con la confirmación;
  - en Pendientes, la llegada aparece solo en su planificación y muestra su código;
  - **error humano**: salida en PLAN-1 y llegada en PLAN-2 → aparece el aviso "Posible pareja en…" → "Cambiar planificación" de la salida a PLAN-2 → se emparejan solas y el consumo pasa a la cantera de PLAN-2.
- **App (el usuario compila):**
  - vehículo en una sola planificación: todo igual que hoy;
  - en dos, en salida: el selector es obligatorio y al elegir cambian cantera y destino;
  - en dos, en llegada: preseleccionada si viene de una salida conocida;
  - todo sin internet;
  - pendientes que sobreviven a la actualización del APK (migración 12→13);
  - fotos que se conservan al girar la pantalla o al volver de la cámara en la llegada.
- **Commits:** solo texto, separados en backend, frontend y app, con el formato `tipo(scope): verbo en infinitivo`.
