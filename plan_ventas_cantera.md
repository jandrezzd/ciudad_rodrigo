# Plan: Ventas de cantera

## Contexto

Hoy el sistema solo modela un flujo: **cantera → obra**, con salida y llegada que se emparejan.
Pero las canteras también venden material directamente, y ese despacho no queda registrado en
ninguna parte: sale un camión con material vendido y el sistema no lo ve.

La venta es un flujo distinto, no una variante del actual:

- **Solo hay salida.** No existe llegada, ni emparejamiento, ni desviación de m³.
- **El QR es de la cantera, no del vehículo.** Es fijo y se escanea muchas veces al día, tantas
  como camiones salgan. El guard anti-duplicado de 10 minutos que protege el flujo de obra sería
  exactamente lo contrario de lo que se necesita aquí.
- **No hay planificación** que asigne vehículos, canteras ni obras.
- **No hay stock.** El consumo de venta no descuenta de `CanteraMaterial` (decisión tomada: en el
  punto de venta no se lleva saldo asignado).
- **No se sincroniza sola.** Los registros se acumulan offline y suben únicamente cuando el
  supervisor pulsa "Enviar todos los pendientes".

**Restricción dura del usuario, que gobierna todo el plan:** no se toca ninguna tabla existente.
El flujo de salida/llegada funciona y no se puede poner en riesgo. Todo lo nuevo vive en tablas,
carpetas, workers y módulos propios.

**Decisiones ya tomadas:** el comprador se registra como **texto libre**; **no** hay datos
económicos (ni precio ni factura); la venta **no** afecta el stock; y una cantera es punto de
venta **si y solo si** tiene una fila en la tabla nueva de QR de venta — sin banderas paralelas
que puedan contradecirse.

---

## Parte 1 — Backend: modelo de datos (aditivo)

`backend/prisma/schema.prisma` — dos modelos nuevos. Nada existente se modifica.

**`CanteraVentaQr`** — la marca de "esta cantera es punto de venta".

```
id Int @id
canteraId Int @unique      // una cantera, un QR
qrcode    String @unique   // "VC-003", derivado del id de cantera
url       String           // "uploads/qr-ventas/VC-003.png"
isActive  Boolean @default(true)
createdAt / updatedAt
cantera   Cantera @relation(...)
```

El código se deriva del `canteraId` (`VC-` + `padStart(3,'0')`), **sin tabla de secuencia**: a
diferencia de los QR de vehículo, aquí no hay lotes anónimos que repartir, el QR pertenece a una
cantera concreta y es estable de por vida. Regenerar el PNG reescribe el mismo código.

**`VentaCantera`** — el registro.

```
id, uuid String @unique          // idempotencia del envío móvil
userId, canteraId
qrcode String
vehicleId Int?                   // resuelto por vehicleid tecleado; null si no se pudo
vehicleIdText String             // lo que escribió el supervisor, siempre se guarda
plate String?  driverName String? // SNAPSHOT al momento del despacho
materialId Int
m3 Float
comprador String?                // texto libre
observation String?
lat / lng Float?
capturedAt DateTime              // reloj del teléfono, corregido con ServerClock
createdAt / updatedAt
isActive Boolean @default(true)  // borrado lógico
platePath / materialPath / driverPath / vehiclePath String?
@@index([canteraId, capturedAt])  @@index([capturedAt])  @@index([vehicleId])
```

`plate`/`driverName` se guardan como snapshot porque un vehículo puede cambiar de chofer: el
registro debe conservar quién manejaba ese día, igual que hace el histórico de transporte.

**Interno / externo no se guarda.** `Vehicle.type` ya existe (`VehicleType = INTERNO | EXTERNO`,
`schema.prisma:59` y `648-651`) y se resuelve con un `include` sobre `vehicleId`. Duplicarlo en
`VentaCantera` crearía dos fuentes que se contradicen en cuanto un vehículo se reclasifique. La
app lo tiene offline en `CachedVehicle.type`, así que puede mostrarlo al resolver el ID tecleado
sin necesidad de red. El único hueco es el vehículo **no resuelto**: ahí se infiere del prefijo
del código (`VI-` interno, `VE-` externo, tal como los genera `generateBatch`), pero solo para
mostrar en pantalla — nunca se persiste una inferencia.

Prefijo de migración nuevo: `2026091xxxxxx_add_venta_cantera`.

## Parte 2 — Backend: módulo `ventas`

Carpeta nueva `backend/src/ventas/`, con la estructura estándar del repo (modelo a copiar:
`src/drivers/`, el módulo más limpio). Registrar en `app.module.ts`.

- **`ventas/multer.config.ts`** propio, clon de `transport-log/multer.config.ts` con
  `uploadDir = uploads/ventas` y prefijo de archivo `venta-`. No se toca la config de transporte.
- **QR PNG en `uploads/qr-ventas/`** — carpeta nueva; `uploads/qr/` queda intacta como pidió el
  usuario. El render reusa la técnica de `vehicles.service.ts:139-172` (`generateQRWithText`),
  copiada al service de ventas para no acoplar los dos módulos.
- El ZIP **no se arma en el backend** (no hay librería de ZIP ahí): igual que con los vehículos,
  el endpoint devuelve `{ success, qrUrls[] }` y el navegador comprime con `jszip`.

Endpoints (`@UseGuards(AuthGuard('jwt'))` a nivel de clase):

| Método | Ruta | Uso |
|---|---|---|
| POST | `ventas/` (multipart) | envío desde la app; **upsert por `uuid`** para que un reenvío no duplique |
| GET | `ventas/` | grilla web, filtros `desde/hasta/canteraId/vehicleId`, solo `isActive` |
| GET | `ventas/:id` | detalle |
| PATCH | `ventas/:id` | corregir m³ / comprador / observación |
| DELETE | `ventas/:id` | borrado lógico (`isActive:false`, patrón `clients.service.ts:26`) |
| GET | `ventas/qr` | listado de QRs de venta con su cantera |
| POST | `ventas/qr/generate` | `{ canteraIds: number[] }` → PNGs + `qrUrls` |
| GET | `ventas/qr/scan?qrcode=` | resuelve el QR a cantera + sus materiales |
| GET | `ventas/catalog` | canteras punto de venta, sus materiales, índice QR→cantera, `serverTime` |
| GET | `ventas/vehiculo/:vehicleid` | placa + chofer del vehículo tecleado |
| GET | `ventas/user/:userId` | historial del supervisor, para la app |
| GET | `ventas/reportes/consumo` | agregados para la vista de reportes |

`ventas/catalog` es endpoint propio y **no** se extiende `transport/catalog`: tocarlo obligaría a
subir versión de cache en la app y arriesgaría el catálogo del flujo que funciona.

Los DTOs deben declarar **todos** los campos del multipart: el `ValidationPipe` global tiene
`forbidNonWhitelisted: true` y rechaza cualquier campo no declarado (ya nos pasó una vez).

## Parte 3 — App móvil

### Modo de trabajo: Venta / Obra

El supervisor de cantera trabaja en **uno de dos modos**, y el modo condiciona toda la app, no
solo el registro: también su historial de envíos. La forma de cambiarlo tiene que ser trivial —
estos usuarios no están familiarizados con apps, y obligarlos a cerrar sesión para ver el reporte
del otro flujo sería inaceptable.

**Pantalla nueva `ElegirModo`**, con dos botones grandes: "Venta" y "Obra". Aparece **después del
login y también del auto-login**, solo si `user_role == "CANTERA"` — los dos `startActivity(...
MenuPrincipal)` de `Home.kt:120` y `Home.kt:65`. El rol OBRA entra directo al menú como hoy.

Elegir un modo guarda `modo_actual` (`"VENTA"` / `"OBRA"`) en `SharedPreferences("AUTH_DATA")` y
**abre el menú principal**, no el escáner. La elección es de contexto, no un atajo a una acción.

**`MenuPrincipal` lee `modo_actual`** y enruta sus tarjetas existentes:

| Tarjeta | Modo OBRA | Modo VENTA |
|---|---|---|
| `cardTransporte` | `ElegirRegistro` (**sin cambios**) | `EscanearQrVenta` |
| `cardReporte` | `Reporte` → historial actual | `RegistroVentas` |
| `cardPendientes` | igual — la lista es común a ambos flujos | igual |

El rótulo de la cabecera (`tvUserRole`, `MenuPrincipal.kt:36-40`) debe mostrar el modo activo de
forma inequívoca, para que nadie registre una venta creyendo que registra una salida a obra.

**Botón de intercambio**, en la **esquina inferior derecha** del menú principal (FAB sobre el
layout de `activity_menu_principal.xml`), visible **solo** si `user_role == "CANTERA"`: cambia
`modo_actual` al otro valor y refresca la pantalla en el sitio. Su texto nombra el destino ("Ir a
Venta" / "Ir a Obra"), nunca el estado actual — decir dónde se está y ofrecer un botón que lleva a
otro lado es la confusión más típica de este patrón. Un solo toque, sin cerrar sesión, sin salir
del menú.

### Escaneo y formulario

`EscanearQrVenta` clona el lanzador ZXing de `ElegirRegistro.kt:33-40,58-70`, consulta
`ventas/qr/scan` con fallback a la tabla local de QR de venta, y **no aplica el guard de 10
minutos** — se documenta explícitamente en el código por qué, para que nadie lo "arregle" después.

`RegistroVenta.kt`, modelado sobre `RegistroSalida.kt`:
- `etVehicleId` (texto) con botón de búsqueda → resuelve placa, chofer y capacidad desde
  `cached_vehicle` (por `vehicleid`) o `ventas/vehiculo/:vehicleid` si hay red. Si no se
  encuentra, **se permite continuar**: se guarda `vehicleIdText` sin `vehicleId` y la web lo
  marca. Negarle el registro a un camión que ya salió no lo devuelve a la cantera.
- `actvMaterial` con los materiales de esa cantera, mismo patrón que `RegistroSalida.kt:777-824`.
- `etM3` con aviso de sobrecarga **no bloqueante** + diálogo de confirmación, idéntico al actual.
- `etComprador` (texto libre), `etObservacion`.
- 4 fotos con `ImageProcessor.processAndStamp` y `FileProvider`, tal cual el flujo existente.
- `formUuid` generado al abrir el formulario + guard `isEnviando`, para que un doble toque no
  cree dos registros.

**Al guardar: solo `dao.insertVenta(...)`.** Nada de `enqueueUniqueWork("sync_<uuid>")` — esa
línea (`RegistroSalida.kt:718-723`) es precisamente lo que no se replica.

### Room — versión 9

- Entidad `PendingVenta` con el mismo bloque de control de sync que `PendingDeparture`
  (`syncStatus`, `attemptCount`, `nextAttemptAt`, `lastErrorCode/Message`, `serverId`, ...).
- Entidad `CachedVentaQr` (`qrcode` PK → `canteraId`) y `CachedCanteraVenta` (cantera + CSV de
  materiales). Son tablas nuevas: `cached_qrcode` solo indexa QRs de vehículos
  (`CatalogRepository.kt:71-73`) y no se toca.
- `MIGRATION_8_9` explícita con los `CREATE TABLE`.
- DAO propio `VentaDao` (o métodos análogos en `PendingDataDao`): `insertVenta`, `dueVentas`,
  `claimVentaForSync` (**el reclamo atómico es obligatorio** — es lo que resolvió el "CONFLICTO DE
  UUID DUPLICADO"), `retryAllVentas`, `allPendingVentas`, `markVentaSynced/Retrying/Failed`,
  `allVentaUuids`, `deleteVenta`.

### Sincronización — worker separado

`VentaSyncWorker`, clon reducido de `SyncWorker.kt` (mismo backoff, mismo reclamo atómico, misma
corrección de reloj con `ServerClock.offsetMs` al enviar). **No se registra ningún trabajo
periódico para él** y no se agrega a `SyncScheduler.schedulePendingSync`. Ese aislamiento es lo
que garantiza el requisito: si las ventas viajaran dentro de `SyncWorker`, el barrido periódico de
6 horas las subiría solo.

Único disparador: `PendingSyncOrchestrator.sendAllPendingNow` agrega `dao.retryAllVentas()` y
encola `VentaSyncWorker` junto al `SyncWorker` actual. Eso cubre de una vez el botón "Enviar todos
los pendientes" de `PendientesActivity` y el "Enviar registros del día" de `MenuPrincipal`.

### Pendientes e historial

- `PendientesActivity`: agregar `PendingRow.Venta` a la sealed class (`:200-227`) y a la carga
  (`:87-105`). La tarjeta y el botón "Reintentar ahora" salen gratis del patrón existente.
- `pendingCount()` y `countUnsynced()` deben sumar también las ventas, o el badge miente.
- **`PhotoRetentionWorker`: agregar `allVentaUuids()` a la unión de la línea 41-50.** Ese worker
  barre las carpetas de `pending/` contra los uuids de salidas y llegadas; sin este cambio, la
  carpeta de fotos de una venta le parece huérfana y la borra. Y como las ventas se acumulan sin
  enviarse, tienen días para que el barrido diario las alcance. Va en el mismo commit que la
  entidad, no después.
- Historial: pantalla `RegistroVentas` que consume `ventas/user/:userId` y muestra "COMPLETADO"
  para lo que el servidor devuelve, mezclado con las pendientes locales marcadas como tales — así
  el supervisor ve de un vistazo qué ya viajó y qué no.

## Parte 4 — Web

**Ruta y nav.** `ROUTES.VENTAS_MATERIAL = '/ventas/material'` en `config/constants.ts:32-46`;
ruta en `AppRouter.tsx` con el anidado de siempre (`ProtectedRoute` → `RoleProtectedRoute
allowedRoles={ADMIN_ONLY}` → `ProtectedLayout`).

**Sidebar** (`Sidebar.tsx`): grupo desplegable "Ventas" clonando literalmente las cuatro piezas
del bloque "Administración" — estado `isVentasOpen` (patrón de la línea 62), detección de hijo
activo + auto-apertura (84-92), botón con chevron (135-150) y contenedor colapsable (152-178) —
con un solo hijo, "Venta de material". Queda al mismo nivel que Dashboard y Planificación, como
se pidió.

**Módulo `src/modules/ventas/`** con la estructura estándar (`components/`, `hooks/`, `services/`,
`types/`, `index.ts` barrel). `VentasPage.tsx` se modela sobre `TransportLogPage.tsx`: header,
barra de acciones, tarjeta de filtros colapsable, `<Table>` + `<Pagination>`, modal de detalle,
export a Excel con `xlsx`.

Diferencias respecto de la página de transporte:
- Columnas: Fecha, Cantera, ID Vehículo, Placa, **Tipo** (interno/externo, del join), Chofer,
  Material, m³, Comprador, Registrado por. "Tipo" va también como filtro y en el Excel: la
  función se usa con ambas clases de vehículo y separarlas es una consulta natural.
  Desaparecen Llegada, Tiempo, Dif (m³) y Estado — no existen en una venta.
- Modal de detalle **sin** "Alerta", "Reasignar vehículo/chofer" ni "Desemparejar". Los tres viven
  en el mismo `<div>` de `TransportLogPage.tsx:1164-1222`, así que al clonar simplemente no se
  copian, junto con sus handlers, estados y los dos modales del final (1683-1723). Tampoco se
  copia "Revisado": sin emparejamiento que validar, no significa nada.
- Sí quedan: ver detalle con fotos, **Editar** (m³ / comprador / observación) y **Eliminar**
  (borrado lógico, con confirmación).
- Botón "Generar QR de venta" → modal con multi-select de canteras → `POST ventas/qr/generate` →
  descarga ZIP. La función `downloadQrZip` se **copia** a `modules/ventas/utils/` en vez de
  extraerse de `VehiclesPage.tsx:52-85`: refactorizar esa página tocaría el flujo de QR de
  vehículos, que funciona, sin ninguna ganancia real.

**Reportes** (`ReportesPage.tsx`): tab nueva `'ventas'` en el array `TABS` (200-259) y su render
condicional (874-881). La sección clona **solo el lado Consumo** de `StockConsumoView.tsx`: KPI de
viajes y m³ totales, "Vehículos que despacharon" (374-467) e "Historial de despachos" (469-551).
Se omiten los bloques de stock — las 3 primeras KPI cards (229-259), "Stock por Cantera"
(271-372), `totalesStock` y `BarraConsumo` — porque en el punto de venta no hay saldo asignado
contra el cual comparar. El resto de las visualizaciones del módulo queda intacto.

---

## Riesgo a mitigar

**Doble registro por doble toque.** En el flujo de venta el mismo QR se escanea decenas de veces
al día, así que el guard anti-duplicado de 10 minutos no puede existir aquí — y sin él, nada atája
un doble toque en "Enviar" o un reenvío del mismo registro.

La defensa son cuatro capas, las mismas que ya evitan el duplicado en salidas:

1. `formUuid` generado **al abrir el formulario**, no al enviarlo — así los dos toques comparten
   el mismo uuid en vez de generar uno cada uno.
2. `uuid @unique` en `VentaCantera`: la base rechaza el segundo aunque el resto falle.
3. **Upsert por `uuid`** en `POST ventas/`: un reenvío se resuelve limpio en vez de estallar con
   un P2002 que el worker interpretaría como error reintentable.
4. Guard `isEnviando` en la Activity, que desactiva el botón al primer toque.

Ninguna sirve sola: la 1 y la 4 cubren el doble toque local, la 2 y la 3 el reenvío desde el
worker. El **reclamo atómico** `claimVentaForSync` en el DAO cierra el último hueco — dos workers
corriendo a la vez sobre la misma fila — y es exactamente lo que resolvió el "CONFLICTO DE UUID
DUPLICADO" en el flujo actual.

---

## Verificación

**Backend**
1. `npx prisma migrate dev` en QA; revisar el SQL generado y confirmar que **ningún `ALTER TABLE`
   toca tablas existentes**.
2. `npx tsc --noEmit` y `npx jest src/ventas`. Tests: upsert por `uuid` idempotente, borrado
   lógico que desaparece de `GET /ventas`, generación de QR que escribe en `uploads/qr-ventas/` y
   deja `uploads/qr/` sin tocar.
3. Regresión obligatoria: `npx jest src/transport-log` — los 61 tests actuales deben seguir en
   verde, es la prueba de que el flujo existente no se movió.

**App**
4. Build limpio con JDK 21 (`org.gradle.java.home` ya configurado).
5. Migración 8→9 sobre un dispositivo con datos v8 previos: las salidas y llegadas pendientes
   deben sobrevivir.
6. Navegación por modo: login con rol CANTERA → aparece `ElegirModo` → elegir "Venta" lleva al
   **menú**, no al escáner; el botón inferior derecho alterna a Obra y las tarjetas cambian de
   destino; cerrar y reabrir la app conserva el modo; con rol OBRA no aparece ni la pantalla de
   elección ni el botón.
7. Escenario completo en modo avión: escanear el QR de cantera 3 veces seguidas → 3 registros, sin
   bloqueo por duplicado; verificar que **no** aparece ningún trabajo de WorkManager encolado;
   esperar el barrido periódico y confirmar que las ventas siguen locales; recuperar red y pulsar
   "Enviar todos los pendientes" → suben las 3.
8. Doble toque en "Enviar" → un solo registro en la base, no dos.
9. Dejar una venta pendiente y forzar `PhotoRetentionWorker`: las fotos deben seguir ahí.

**Web**
10. La grilla lista, filtra y exporta; el detalle no muestra Alerta / Reasignar / Desemparejar;
    eliminar oculta el registro pero la fila sigue en la base con `isActive = false`.
11. Generar QR para 2 canteras → ZIP con 2 PNGs; verificar que la carpeta `uploads/qr/` de
    vehículos quedó intacta y que descargar un QR de vehículo sigue funcionando.
12. Reportes: la tab de ventas muestra consumo sin bloques de stock; las demás tabs no cambian.

## Orden de implementación sugerido

1. Backend (schema + migración + módulo + QR) — es lo que desbloquea a los otros dos.
2. Web (nav, grilla, generación de QR) — permite crear los QR y ver lo que la app envíe.
3. App (Room v9, formulario, worker separado, pendientes) — lo último, porque necesita QRs reales
   para probarse y es donde está el riesgo de pérdida de datos.
