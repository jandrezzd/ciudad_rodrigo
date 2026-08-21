# Plan: Emparejamiento de viajes por ventana de tiempo (salida↔llegada offline, multi-vehículo, multi-vuelta)

## Contexto

El sistema registra transporte de material cantera→obra vía una app móvil (`CR_APP`, Kotlin nativo, fuera de este repo) usada por dos personas distintas por vehículo: un supervisor en cantera (registra la **salida**) y un supervisor en obra (registra la **llegada**). Ambos operan **sin internet**, cada uno en su propio celular, y un mismo vehículo hace **varias vueltas** cantera↔obra en el día.

Hoy el backend exige, al recibir una llegada, encontrar sincrónicamente una salida abierta del mismo vehículo (`SELECT ... FOR UPDATE ... WHERE vehicleId=... AND status='EN_PROGRESO'` en `transport-log.service.ts:619-640`) — si no la encuentra, rechaza con `409 NO_OPEN_DEPARTURE`. Esto no funciona en el escenario real: la salida y la llegada pueden sincronizar en cualquier orden, con horas o hasta días de diferencia, porque dependen de que cada supervisor recupere señal por su cuenta.

El objetivo de este plan es: (1) permitir que una llegada se guarde en el servidor sin depender de que su salida ya haya sincronizado, (2) resolver el emparejamiento salida↔llegada después, por placa y por ventana de tiempo derivada de un nuevo campo de "tiempo promedio de viaje" en la Planificación, (3) dar a un administrador del portal web las herramientas para resolver a mano los casos que no calzan solos (vehículo averiado, reemplazo de vehículo/chofer a mitad de viaje), y (4) ajustar la app móvil para que el flujo de registro deje de bloquearse cuando no encuentra la salida, y para que la sincronización de cierre de jornada sea confiable.

Este plan toca tres proyectos:
- **Backend**: `d:\Proyectos sistemas\GIORVER PEREZ\ciudad_rodrigo\backend` (NestJS 11 + Prisma 6 + PostgreSQL)
- **Frontend web**: `d:\Proyectos sistemas\GIORVER PEREZ\ciudad_rodrigo\frontend` (React + TS + Vite)
- **App móvil**: `C:\Users\Sistemas\StudioProjects\CR_APP` (Kotlin nativo, repo separado)

Decisiones ya confirmadas con el cliente:
- Ventanas de llegada **fijas** (constantes de sistema, no por planificación todavía): vehículo puede llegar **10 min antes** hasta **25 min tarde** de la hora esperada. No hay ventana para la salida (varía por cola/material).
- `distanciaAproximada` es **solo informativa**, nunca se usa en el cálculo de emparejamiento. Solo `tiempoPromedioViaje` se usa.
- Almuerzo: checkbox opcional (nullable/false por defecto), 1 hora fija, se resta del tiempo esperado cuando aplica. Aplica igual a vehículos internos y externos.
- El botón "Reintentar" de la pantalla Pendientes y el envío automático **no se tocan** — se mantienen tal cual, en paralelo a lo nuevo.
- Acciones de emparejar manualmente y reasignar vehículo/chofer: **solo rol ADMIN**.
- Motivo de reasignación: **texto libre anexado al campo `observation`** del viaje (no se crea tabla de auditoría dedicada en esta v1).

---

## Parte 1 — Backend

### 1.1 Cambios de modelo (`backend/prisma/schema.prisma`)

**`Planning`** (hoy en líneas 146-166, sin ningún campo de distancia/tiempo — confirmado por grep, cero resultados previos): agregar

```prisma
distanciaAproximadaKm  Float?   // informativo, NO se usa en el emparejamiento
tiempoPromedioViajeMin Int?     // minutos; único campo usado por el algoritmo
```

Se guarda en minutos (no horas decimales) porque las ventanas de tolerancia (10/25 min) y el descuento de almuerzo (60 min) son aritmética entera de minutos — evita conversiones y redondeos en cada cálculo. El formulario web sigue mostrando "horas" al usuario (ver 3.1); la conversión horas↔minutos va en el DTO/formulario, no en el dato guardado. Ambos campos nullable: si `tiempoPromedioViajeMin` es null en una planificación (histórica o mal cargada), esos viajes solo se pueden emparejar manualmente.

**Almuerzo** — agregar a `TransportDeparture` (línea 259-280) y `TransportArrival` (línea 282-304):
```prisma
almuerzo Boolean @default(false)
```
Marcable por cualquiera de los dos supervisores (el que note que el chofer se fue a almorzar), no es atributo del vehículo ni de la planificación. Espejo en `TransportTrip` (línea 204-257):
```prisma
almuerzoAplicado Boolean @default(false) // = departure.almuerzo OR arrival.almuerzo
```
mismo patrón que ya usan `departureAt`/`arrivalAt` como "espejo" de los datos reales.

**Nuevo estado en `TransportStatus`** (enum en línea ~583): agregar `PENDIENTE_EMPAREJAMIENTO` — lo asigna el job periódico (1.3) a un trip `EN_PROGRESO` cuya ventana esperada ya cerró sin llegada; es la señal visual para la cola de revisión del administrador (caso vehículo averiado). Sigue intentando emparejar automáticamente después, no es un estado terminal. Postgres exige que un valor de enum nuevo se agregue en su propia migración, separada de cualquier uso.

**Tabla nueva `TransportArrivalPending`** — para llegadas que llegan al servidor sin ninguna salida que las explique todavía. Se evaluó la alternativa de crear un `TransportTrip` "placeholder" desde la llegada (haciendo `TransportArrival.tripId` nullable), y se descartó: `TransportTrip.departureAt` es NOT NULL y es literal espejo de la salida real, `uuid` del trip es literalmente `== clientUuid de la salida`, y el descuento de stock de cantera ocurre en `submitDeparture` con datos que una llegada huérfana no tiene (canteraId, materialId) — inventar un placeholder rompe esas invariantes en ~10 puntos del código (`flatten-trip.ts`, `cantera-stock.service.ts`, dashboard) y obliga a que `submitDeparture` busque primero si ya hay un placeholder esperando, duplicando la lógica de emparejamiento en ambas direcciones sobre la tabla central. Una tabla de staging angosta (solo los ~10 campos propios de una llegada) es más simple y no toca la tabla que ya alimenta reportes, dashboard y filtros por rol:

```prisma
model TransportArrivalPending {
  id         Int          @id @default(autoincrement())
  clientUuid String       @unique @db.Uuid
  source     RecordSource @default(ONLINE)
  capturedAt DateTime
  receivedAt DateTime     @default(now())

  vehicleId   Int
  userId      Int
  m3          Float
  m3Corrected Float?
  lat         Float?
  lng         Float?
  abscisa     Int?
  almuerzo    Boolean @default(false)

  driverPhoto    String?
  vehiclePhoto   String?
  platePhoto     String?
  materialPhoto1 String?
  materialPhoto2 String?

  status        PendingArrivalStatus @default(PENDIENTE)
  matchedTripId Int?           @unique
  matchedTrip   TransportTrip? @relation(fields: [matchedTripId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  vehicle Vehicle @relation(fields: [vehicleId], references: [id])
  user    User    @relation(fields: [userId], references: [id])

  @@index([vehicleId, status, capturedAt])
}

enum PendingArrivalStatus {
  PENDIENTE
  EMPAREJADO
  EXPIRADO // informativo; sigue siendo emparejable manualmente
}
```

Al emparejar (automático o manual), los datos se copian a un `TransportArrival` real sobre el trip definitivo, y la fila pendiente se conserva con `status=EMPAREJADO` + `matchedTripId` como bitácora (no se borra).

**`Driver`** (línea 433-441, hoy `{ id, name?, document?, phone? }`, sin `isActive`, sin distinción interno/externo): agregar
```prisma
isActive Boolean @default(true)
```
por consistencia con el resto de entidades maestras (`Vehicle`, `Owner`, `Client`, `Cantera`, `MaterialProvider` ya lo tienen). No se agrega interno/externo — el requisito de almuerzo aplica igual a ambos, ese campo no hace falta. No se fuerza `UNIQUE` en `document` (evita riesgo de migración sobre datos existentes sin haberlos auditado primero; no lo pide ningún requisito).

### 1.2 Algoritmo de reconciliación

Constantes de sistema (no en BD todavía), nuevo módulo `backend/src/transport-log/reconciliation/`:
```
EARLY_TOLERANCE_MIN = 10
LATE_TOLERANCE_MIN  = 25
LUNCH_DURATION_MIN  = 60
```

```
computeExpectedWindow(departureAt, tiempoPromedioViajeMin, almuerzoAplicado):
    travel = tiempoPromedioViajeMin
    if almuerzoAplicado:
        travel = max(travel - LUNCH_DURATION_MIN, 0)
    expected = departureAt + travel minutos
    return [expected - EARLY_TOLERANCE_MIN, expected + LATE_TOLERANCE_MIN]
```

Tres disparadores:

1. **En `submitDeparture`** (después de la transacción de creación, en su propio try/catch que nunca revierte la salida ya registrada — mismo principio que ya documenta `cantera-stock.service.ts`, "nunca rechaza un despacho"): busca en `TransportArrivalPending` (`status=PENDIENTE`, mismo `vehicleId`) candidatos dentro de `computeExpectedWindow(...)`. 0 matches → trip queda `EN_PROGRESO`. 1 match → cierra en el acto (crea `TransportArrival` real, calcula `deviationM3`/status igual que hoy hace `submitArrival`, marca la fila pendiente `EMPAREJADO`, libera QR). >1 match → no resuelve automático, queda para revisión manual (si un vehículo "llega dos veces a la misma hora" es señal de algo raro, no algo que un algoritmo deba adivinar).

2. **En `submitArrival`**, solo en la rama que hoy resuelve por `qrcode`/`vehicleId` (la del `FOR UPDATE`, líneas 619-640). Si no encuentra trip abierto: **ya no lanza `NO_OPEN_DEPARTURE`** — inserta en `TransportArrivalPending` (idempotente por `clientUuid`, igual patrón que ya usa `TransportArrival`) y responde `200 { success: true, pendingMatch: true, data }`. Importante: las ramas por `departureUuid` y `tripId` explícito (líneas 519-537) **no cambian** — un `departureUuid` solo lo puede mandar el mismo dispositivo que hizo la salida, así que no encontrarlo ahí sigue siendo un error de cliente genuino, no el escenario cross-dispositivo que motiva este cambio.

3. **Job periódico** (nuevo — requiere agregar dependencia `@nestjs/schedule` y `ScheduleModule.forRoot()` en `AppModule`, no existe ningún cron hoy en el proyecto), cada ~5 min: empareja trips `EN_PROGRESO`/`PENDIENTE_EMPAREJAMIENTO` sin llegada contra `TransportArrivalPending PENDIENTE` (cubre el caso "la llegada sincronizó antes que la salida"); pasa a `PENDIENTE_EMPAREJAMIENTO` los trips cuya ventana ya cerró sin match (sin dejar de reintentarlos después); marca `EXPIRADO` (solo informativo) los pendientes con más de ~7 días sin match.

Anti-reutilización garantizada estructuralmente: todo consumo de `TransportArrivalPending` es `UPDATE ... WHERE status='PENDIENTE'` dentro de transacción con `FOR UPDATE` (mismo patrón que ya usa `submitArrival` hoy); `matchedTripId` es `@unique`; `TransportArrival.tripId` ya es `@unique`.

### 1.3 Endpoints nuevos/modificados

`backend/src/transport-log/transport-log.controller.ts`:

| Ruta | Cambio | Rol |
|---|---|---|
| `POST /transport/arrival` | Modificado: ya no 409 en la rama por qrcode/vehicleId sin match; hace staging | SUPERVISOR (sin cambio) |
| `GET /transport/pending-arrivals` | Nuevo — lista llegadas huérfanas para revisión | ADMIN, JEFE_DE_OBRA, PLANIFICADOR (lectura) |
| `GET /transport/unmatched-departures` | Nuevo — lista trips `EN_PROGRESO`/`PENDIENTE_EMPAREJAMIENTO` sin llegada | mismos roles de lectura |
| `POST /transport/manual-match` | Nuevo `{ tripId, pendingArrivalId }` — **no exige mismo vehicleId** (vía de escape para vehículo de reemplazo) | ADMIN |
| `PATCH /transport/:id/reassign` | Nuevo `{ vehicleId?, driverId?, reason }` — reasigna vehículo/chofer de un trip ya creado; libera/ocupa QR según corresponda; anexa `reason`+usuario+timestamp a `observation`; bloqueado si el trip ya está `REVISADO`/`VALIDADO` | ADMIN |

`backend/src/drivers/` (hoy solo `drivers.service.ts::findAll()` y `GET /drivers`, sin DTOs): agregar `GET /drivers/:id`, `POST /drivers`, `PATCH /drivers/:id`, `PATCH /drivers/:id/deactivate` (bloquea si el chofer sigue siendo `Vehicle.driverId` de un vehículo activo, mismo criterio que ya usa la validación de owner inactivo en `submitDeparture`) — todo ADMIN, siguiendo el patrón de checks de rol inline que ya usa el resto del proyecto (no hay `RolesGuard` centralizado, no se introduce uno nuevo a mitad de esta feature).

### 1.4 Migraciones (orden, siguiendo el patrón `YYYYMMDDHHMMSS_description` ya usado)

1. `..._add_planning_distance_and_travel_time` — `Planning.distanciaAproximadaKm`, `Planning.tiempoPromedioViajeMin`.
2. `..._add_driver_isactive` — `Driver.isActive`.
3. `..._add_almuerzo_fields` — `TransportDeparture.almuerzo`, `TransportArrival.almuerzo`, `TransportTrip.almuerzoAplicado`.
4. `..._add_transport_status_pendiente_emparejamiento` — `ALTER TYPE "TransportStatus" ADD VALUE 'PENDIENTE_EMPAREJAMIENTO'` (migración propia y aislada).
5. `..._create_transport_arrival_pending` — tabla `TransportArrivalPending` + enum `PendingArrivalStatus`.

Package: agregar `@nestjs/schedule` a `backend/package.json` (alinear versión con el resto de `@nestjs/*`, hoy `^11.0.x`).

---

## Parte 2 — App móvil (CR_APP)

Verificado en el código real: el payload de `registerArrival` (`data/remote/Network.kt:195-212`) **ya envía `qrcode` y `departureUuid` como opcionales** y `SyncWorker.kt` ya tolera `departureUuid == null`. El bloqueo real es 100% del lado cliente, en `ElegirRegistro.kt`.

### 2.1 Quitar el bloqueo de llegada sin match

`ElegirRegistro.kt`, rama `"OBRA"` de `manejarNavegacion()` (líneas 199-216): hoy exige `res.data != null` o falla con "NO SE ENCONTRÓ EL VIAJE ACTIVO". Cambiar para que solo bloquee si **no se pudo identificar el vehículo** (ni por `res.data?.vehicle` ni por `res.vehicle`, que `ScanResponse` ya trae a nivel raíz); si hay vehículo pero no hay viaje/salida conocida, construir un `TransportLogData` mínimo (`id=-1`, sin `constSite`/`client`/`material`) y continuar a `RegistroLlegada` con un extra `MATCH_FOUND=false`.

`RegistroLlegada.kt`: cuando `MATCH_FOUND=false`, mostrar aviso no bloqueante (no `AlertDialog` con `setCancelable(false)`) tipo "No se encontró la salida registrada para este vehículo. Se guardará la llegada igualmente y se emparejará automáticamente al sincronizar." Ajuste adicional necesario: `abscisaMaxima` se inicializa desde `data.constSite?.abscisa ?: 0.0` (línea 123) — con el trip sintético esto vale `0.0` y bloquea cualquier abscisa ingresada por el filtro de `actualizarEstadoBotonEnviar()`; tratar `constSite == null` como "sin límite conocido".

`findUnsyncedDepartureByQr` y `cached_open_trip` **se mantienen** — dejan de ser gate obligatorio y pasan a ser solo optimización de prellenado cuando sí hay match disponible.

### 2.2 Checklist de almuerzo

Agregar `val lunchBreak: Boolean = false` a `PendingDeparture.kt` y `PendingArrival.kt`. Checkbox opcional en **ambos** formularios (`RegistroSalida.kt`, `RegistroLlegada.kt` — junto al campo de observación en sus layouts), porque cualquiera de los dos supervisores puede ser quien note el almuerzo, y ya no se puede asumir que ambos registros de un mismo viaje se correlacionan en el mismo dispositivo. Subir como `@Part("lunchBreak")` en `Network.kt` (`createDeparture` y `registerArrival`) y en `SyncWorker.kt` (bloques de subida de departure/arrival) — coordinado con el campo `almuerzo` del backend (1.1).

### 2.3 Migración de Room sin pérdida de datos

`AppDatabase.kt` usa `fallbackToDestructiveMigration()` (v6, línea 45). Agregar `lunchBreak` sube a v7 — con fallback destructivo, cualquier dispositivo con registros pendientes sin sincronizar en ese momento **pierde esos registros al actualizar la app**. Reemplazar por una `Migration(6, 7)` explícita con `ALTER TABLE pending_departure ADD COLUMN lunchBreak INTEGER NOT NULL DEFAULT 0` y lo mismo para `pending_arrival` — evita perder trabajo de campo justo el día del despliegue.

### 2.4 Fix del badge de pendientes

`PendingDataDao.pendingCount()` (línea 22-23) hoy solo cuenta `pending_departure`. Cambiar a la suma de `pending_departure` + `pending_arrival` con `syncStatus != 'SYNCED'`. `MenuPrincipal.kt` no necesita cambios (ya consume `Flow<Int>`).

### 2.5 Sync #3 — "Enviar registros del día"

Recomendación: **botón nuevo en Home + botón "Reintentar todo" en Pendientes**, ninguno reemplaza al "Reintentar" individual existente (que el cliente pidió mantener intacto).

- Nuevo `sync/PendingSyncOrchestrator.kt` (o método en `SyncScheduler.kt`) con `sendAllPendingNow(context)`: dos queries bulk nuevas en `PendingDataDao.kt` (`retryAllDepartures`/`retryAllArrivals`, análogas a las ya existentes por fila), encola un `OneTimeWorkRequest<SyncWorker>` único (`enqueueUniqueWork("sync_all_manual", REPLACE, NetworkType.CONNECTED)`), y **a diferencia de sync #1/#2 (silenciosas), espera el resultado** (observando `WorkInfo`) para mostrar confirmación explícita: "Enviado correctamente" o "Quedan N registros sin enviar (revise Pendientes)" — esto es lo que la hace sentir "obligatoria" en espíritu.
- UI: `btnEnviarRegistrosDia` en `activity_menu_principal.xml` (debajo de la tarjeta Pendientes), wireado en `MenuPrincipal.kt`. Botón equivalente `btnReintentarTodo` en `activity_pendientes.xml` / `PendientesActivity.kt`, misma función compartida.

Sync #1 (manual matutina) y sync #2 (automática al detectar señal) **ya existen y cumplen su rol** (`btnSyncCatalog`/`sincronizarCatalogoAhora()` y el `OneTimeWorkRequest` por registro con `NetworkType.CONNECTED`, respectivamente — no disparan por polling cada 6h, WorkManager los dispara apenas el SO detecta red). Único ajuste recomendado: bajar `schedulePendingSync` (la red de seguridad periódica) de 6h a 2h en `SyncScheduler.kt` — reduce la ventana de riesgo de cara al cierre de jornada sin cambiar su carácter silencioso.

---

## Parte 3 — Frontend web

### 3.1 Formulario de Planificación

`frontend/src/modules/planificacion/components/PlanificacionForm.tsx` (grid principal, líneas 286-399) y `frontend/src/modules/planificacion/types/index.ts` (`PlanificacionFormData`, líneas 93-110): agregar `distanciaAproximadaKm?: number` (input numérico) y `tiempoPromedioViajeMin?: number` (mostrado como seguidor de horas — ej. un `Select`/stepper de horas que internamente multiplica por 60 al guardar). Incluir en `buildFormData` (línea 60) y en `planificacionService.create`/`update` (`frontend/src/modules/planificacion/services/planificacionService.ts`).

### 3.2 Revisión de viajes — nueva vista de conciliación

`frontend/src/modules/registro-transporte/` hoy no tiene ninguna acción de reasignar, cancelar, ni forzar completado (confirmado: `transportLogService.ts` solo expone `getAll/getById/getByQrCode/createDeparture/registerArrival/correctMaterial/markAsAlert/markReviewed`). Agregar:
- Sección o pestaña nueva "Pendientes de emparejar": lista `GET /transport/pending-arrivals` + `GET /transport/unmatched-departures` lado a lado; acción "Emparejar" que llama `POST /transport/manual-match`.
- Badge de estado nuevo para `PENDIENTE_EMPAREJAMIENTO` en `statusToBadge`/`StatusBadge.tsx` (líneas 75-82), color distintivo (ej. gris/ámbar) junto a los 6 ya existentes.
- Acción "Reasignar vehículo/chofer" en el modal de detalle del viaje (junto a los botones existentes de Alerta/Revisado/Editar M3, líneas 897-922): formulario con selector de vehículo, selector de chofer y campo de motivo obligatorio → `PATCH /transport/:id/reassign`.
- Corregir el union type `TransportStatus` en `types/index.ts` para incluir `'VALIDADO'` y el nuevo `'PENDIENTE_EMPAREJAMIENTO'` (hoy falta `VALIDADO` pese a usarse en el componente — inconsistencia preexistente detectada durante la exploración).
- Indicador de almuerzo (ícono/badge) en la fila del viaje cuando `almuerzoAplicado === true`.

### 3.3 Gestión de choferes

Hoy no existe módulo `drivers/` en el frontend (el `Driver` solo se ve embebido dentro de `vehicles/` y `planificacion/DriverSelector.tsx`, y solo permite asignar un chofer ya existente a un vehículo, no crear/editar choferes). Con el nuevo CRUD de backend (1.3), agregar una vista simple de choferes (crear, editar, desactivar) — puede vivir dentro de `frontend/src/modules/vehicles/` como sub-sección, o como módulo `drivers/` nuevo si se prefiere separado; seguir el patrón ya usado por `vehicles`/`planificacion` (types, service con axios, componente de listado + formulario).

---

## Verificación

- **Backend**: `npx prisma migrate dev` aplica las 5 migraciones sin error sobre una copia de la base real; test manual de `submitArrival` sin salida previa → debe responder 200 con `pendingMatch:true` en vez de 409; test manual de `submitDeparture` con una `TransportArrivalPending` ya esperando dentro de ventana → debe cerrar el trip automáticamente; test del job periódico corriendo con `@nestjs/schedule` activo, verificar logs de emparejamiento.
- **App móvil**: compilar y correr en un dispositivo/emulador en modo avión; escanear QR de llegada de un vehículo sin salida conocida → debe permitir continuar y guardar en `pending_arrival` con `departureUuid=null`; verificar que al actualizar de v6 a v7 con registros pendientes en Room, estos sobreviven (la `Migration(6,7)` explícita, no destructiva); verificar badge de Pendientes cuenta ambos tipos; probar botón "Enviar registros del día" con y sin conexión.
- **Frontend web**: crear una planificación con `tiempoPromedioViajeMin` cargado, generar salida+llegada dentro y fuera de ventana desde la app/API directamente, confirmar que la vista de conciliación muestra los huérfanos y que "Emparejar manualmente" y "Reasignar vehículo/chofer" funcionan end-to-end contra el backend real.
