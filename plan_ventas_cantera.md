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

### Elección Venta / Obra

Se inserta en el click de `cardTransporte` (`MenuPrincipal.kt:42-44`), que ya tiene el rol leído
en la línea 29: si `user_role == "CANTERA"` abre la pantalla de elección, si no va directo a
`ElegirRegistro` como hoy. Se prefiere este punto y no el post-login porque el menú también
contiene Reportes y Pendientes, que son comunes a ambos flujos — una pantalla bloqueante tras el
login obligaría a elegir modo para consultar un reporte.

Pantalla nueva `ElegirModo` con dos botones grandes. "Obra" → `ElegirRegistro` (**cero cambios**
en ese flujo). "Venta" → `EscanearQrVenta`.

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
- Columnas: Fecha, Cantera, ID Vehículo, Placa, Chofer, Material, m³, Comprador, Registrado por.
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

## Riesgos y cómo se resuelven

**1. `PhotoRetentionWorker` borraría las fotos de las ventas pendientes.** *(alto)*
Barre las carpetas de `pending/` contra `allDepartureUuids() + allArrivalUuids()`
(`PhotoRetentionWorker.kt:41-50`). Una carpeta de venta le parecería huérfana y la borraría — y
como las ventas se acumulan sin enviarse, tienen mucho tiempo para que el worker diario las
alcance. **Solución:** agregar `allVentaUuids()` a esa unión en el mismo commit que la entidad.

**2. `fallbackToDestructiveMigration()` puede borrar ventas no enviadas.** *(alto)*
Está activo en `AppDatabase.kt:73` como red de seguridad, justificado porque los catálogos se
re-descargan. Pero las ventas pendientes **no** se re-descargan: son el único ejemplar del dato.
Si la migración 8→9 falla en algún equipo, se pierden. **Solución:** escribir la `MIGRATION_8_9`
explícita y probarla en un dispositivo con datos v8 antes de publicar; y considerar quitar el
fallback ahora que la base contiene datos irrecuperables.

**3. Ventas que nunca se envían.** *(alto, inherente al diseño pedido)*
Sin sincronización automática, un supervisor que no pulse el botón acumula despachos que solo
existen en su teléfono. Si el equipo se pierde o se reinstala la app, el dato no está en ningún
lado. **Solución:** badge de pendientes bien visible en el menú (ya existe, hay que sumarle las
ventas) y un aviso al abrir la app cuando haya pendientes con más de N días de antigüedad.

**4. Escanear el QR equivocado.** *(medio)*
Un QR de venta (`VC-003`) escaneado en el flujo de obra llegaría a `transport/qr/scan` y devolvería
un error genérico de "vehículo no encontrado", confuso para un usuario poco familiarizado con
apps. **Solución:** detectar el prefijo en ambos escáneres y mostrar un mensaje explícito
("Este QR es de venta de cantera, use la opción Venta").

**5. Vehículo no encontrado sin internet.** *(medio)*
El catálogo cacheado puede no tener un vehículo externo recién dado de alta. **Solución:** ya
contemplada arriba — se guarda `vehicleIdText` sin `vehicleId`, el backend reintenta resolverlo al
recibir, y la web muestra esos registros marcados para que un ADMIN los complete.

**6. Doble registro por doble toque.** *(medio)*
Aquí no hay guard de 10 minutos que ataje nada. **Solución:** `uuid` generado al abrir el
formulario + `@unique` en la tabla + upsert por `uuid` en el backend + guard `isEnviando` en la
Activity. Las tres capas juntas son las que ya evitan el duplicado en salidas.

**7. `capturedAt` fuera de rango.** *(medio, ya nos pasó)*
Teléfonos con el reloj desfasado dejaron registros trabados permanentemente. **Solución:** aplicar
`ServerClock.offsetMs()` **al enviar**, no al capturar — exactamente como quedó `SyncWorker.kt:104-109`.

**8. Las llaves foráneas hacia `Cantera`, `Vehicle`, `Material` y `User`.** *(bajo, pero conviene
tenerlo claro)* Declarar la relación en Prisma **no altera las tablas existentes**: la columna y
el `FOREIGN KEY` se crean en las tablas nuevas. En `Cantera` solo aparece un campo virtual de
relación inversa, que no genera SQL. La migración se revisa antes de aplicarla para confirmarlo.

**9. Almacenamiento del teléfono.** *(bajo)* 4 fotos por venta × decenas de ventas sin enviar.
**Solución:** ya está resuelto por el pipeline actual, que comprime a 1280px / calidad 60.

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
6. Escenario completo en modo avión: escanear el QR de cantera 3 veces seguidas → 3 registros, sin
   bloqueo por duplicado; verificar que **no** aparece ningún trabajo de WorkManager encolado;
   esperar el barrido periódico y confirmar que las ventas siguen locales; recuperar red y pulsar
   "Enviar todos los pendientes" → suben las 3.
7. Dejar una venta pendiente y forzar `PhotoRetentionWorker`: las fotos deben seguir ahí.

**Web**
8. La grilla lista, filtra y exporta; el detalle no muestra Alerta / Reasignar / Desemparejar;
   eliminar oculta el registro pero la fila sigue en la base con `isActive = false`.
9. Generar QR para 2 canteras → ZIP con 2 PNGs; verificar que la carpeta `uploads/qr/` de
   vehículos quedó intacta y que descargar un QR de vehículo sigue funcionando.
10. Reportes: la tab de ventas muestra consumo sin bloques de stock; las demás tabs no cambian.

## Orden de implementación sugerido

1. Backend (schema + migración + módulo + QR) — es lo que desbloquea a los otros dos.
2. Web (nav, grilla, generación de QR) — permite crear los QR y ver lo que la app envíe.
3. App (Room v9, formulario, worker separado, pendientes) — lo último, porque necesita QRs reales
   para probarse y es donde está el riesgo de pérdida de datos.
