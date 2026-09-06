Ready for review
Select text to add comments on the plan
Plan: Bañeras intercambiables + manejo de cambio de cabezal en ruta
Contexto
El sistema (backend NestJS + Prisma/PostgreSQL, frontend React, y la app móvil Android offline-first CR_APP) modela hoy el vehículo como una unidad monolítica: 1 placa, 1 capacidad, 1 QR, 1 chofer. La empresa necesita reflejar la realidad operativa real:

El cabezal (tracto/vehículo) y la bañera (tolva/remolque) son piezas físicas independientes que se acoplan y desacoplan.
Una bañera puede dañarse en el camino y ser reemplazada por otra, incluso a mitad de trayecto entre cantera y obra.
El propio cabezal puede dañarse en el camino; el material igual debe llegar a la obra, posiblemente en OTRO camión.
Todo esto ocurre en campo, muchas veces sin conexión a internet — la app móvil se sincroniza una vez en la mañana con la planificación y no puede depender de la nube durante el día. Esta restricción es innegociable y no se toca.
El sistema está en producción ahora mismo. Cualquier cambio debe ser aditivo y desplegarse en fases, sin romper flujos actuales.
Los dueños quieren decisiones ya tomadas (confirmadas en la conversación):

Cada bañera tendrá su propio QR físico (igual que ya tiene cada vehículo), generado en lote desde un CRUD nuevo, análogo al de Vehículos.
Que la bañera de salida sea distinta a la de llegada es un evento normal: se registra sin bloquear ni marcar alerta automática, ambas quedan guardadas por separado.
El módulo de Bañeras debe ser un CRUD completo tipo Vehículos: código/placa, capacidad (m³), ejes, estado (activa/dañada/en reparación/inactiva), generación de QR en lote, historial de qué vehículo la ha llevado.
También se debe resolver, en el mismo esfuerzo, el caso de cambio de cabezal en ruta (el camión se daña y el material sigue en otro camión) — el viaje se debe poder cerrar completo igual, sin perder el registro del material.
Hallazgo clave: la mitad del problema del cabezal YA está resuelta
Antes de diseñar nada nuevo, se investigó a fondo transport-log.service.ts, reconciliation.service.ts y el módulo de conciliación del frontend (registro-transporte/components/ConciliacionPanel.tsx), y aparece que el cambio de cabezal en ruta ya es un caso contemplado y soportado end-to-end:

submitArrival (backend/src/transport-log/transport-log.service.ts:549) resuelve el vehículo de la LLEGADA por su propio QR escaneado, independiente del vehículo de la salida. Si no encuentra un viaje abierto para ESE vehículo, no rechaza nada: crea una fila en TransportArrivalPending ("llegada sin salida todavía", línea 834-848).
El emparejamiento automático (reconciliation.service.ts) intenta cerrar por vehicleId + cercanía en el tiempo. Si el vehículo cambió, nunca calza solo, y el viaje queda PENDIENTE_EMPAREJAMIENTO — visible, no perdido.
El panel web ConciliacionPanel.tsx (frontend/src/modules/registro-transporte/) ya permite a un admin/jefe emparejar manualmente una "salida sin llegada" con una "llegada sin salida" sin exigir que sea la misma placa — el comentario del propio código dice textualmente: "no hace falta que sea la misma placa (por ejemplo, si un vehículo de reemplazo terminó el viaje)" (ConciliacionPanel.tsx:136-137).
Existe también reassignTrip (transport-log.service.ts:~1780) para que un ADMIN corrija a mano el vehículo/chofer de un viaje aún abierto, con motivo obligatorio y traspaso del estado OCUPADO/DISPONIBLE del QR entre el vehículo viejo y el nuevo.
Lo que falta no es "inventar" el mecanismo, sino tres cosas puntuales:

Cuando el emparejamiento (automático o manual) cierra un viaje con una llegada de OTRO vehículo, hoy se pierde el dato de qué vehículo llegó realmente — TransportArrival no tiene columna vehicleId propia, solo hereda el vehicleId original del trip (revisar closeTripWithPendingArrival, líneas 296-332, y el create de submitArrival, líneas 943-961: ninguno guarda el vehículo de la llegada). Para auditoría ("¿qué camión completó este viaje?") hay que persistirlo.
Cuando el viaje se cierra con un vehículo distinto, el QR del vehículo NUEVO (el que completó la llegada) nunca se marcó OCUPADO durante el trayecto ni pasa por el mismo ciclo de vida — es un detalle menor de estado de QR, no bloqueante, se deja anotado.
Todo este mecanismo debe extenderse para cargar también la bañera (que hoy no existe en ningún lado del modelo).
Esto reduce muchísimo el riesgo del proyecto: no hay que rediseñar el emparejamiento de viajes, solo enriquecerlo con bañera y completar el registro del vehículo real de llegada que hoy se descarta.

1. Modelo de datos (Prisma)
Archivo: backend/prisma/schema.prisma. Nueva migración incremental (con prisma migrate dev, no destructiva — recordar que este proyecto no tiene una migración inicial única, se ha ido construyendo a golpes de migraciones puntuales, [[prisma-sin-migracion-inicial]]).

model Baniera {
  id Int @id @default(autoincrement())

  code       String          @unique   // ej. "BA-001" (secuencia propia)
  qrcodeId   Int?            @unique
  qrcode     BanieraQRCode?  @relation(fields: [qrcodeId], references: [id])

  plate       String?        @unique   // placa de remolque si aplica (puede no tener)
  capacity    Float                    // m³
  axles       Int                      // ejes
  status      BanieraStatus  @default(ACTIVA)   // ACTIVA | DANADA | EN_REPARACION | INACTIVA
  observation String?

  departures  TransportDeparture[]
  arrivals    TransportArrival[]
  pendingArrivals TransportArrivalPending[]

  isActive  Boolean @default(true)
  createdAt DateTime @default(now())
}

model BanieraQRCode {
  id Int @id @default(autoincrement())
  qrcode String @unique
  url    String
  status QRCodeStatus @default(DISPONIBLE)   // reutiliza el enum existente
  baniera Baniera?
  createdAt DateTime @default(now())
}

model BanieraSequence {
  id     Int    @id @default(autoincrement())
  prefix String @unique   // "BA"
  last   Int
}

enum BanieraStatus {
  ACTIVA
  DANADA
  EN_REPARACION
  INACTIVA
}
Extensiones a modelos existentes (todas nullable, aditivas, cero riesgo de romper datos actuales):

Vehicle: banieraActualId Int? + relación banieraActual Baniera? @relation("VehicleCurrentBaniera", ...) — la bañera "por defecto" acoplada hoy a ese cabezal. Es solo informativo/para precargar en planificación y en el catálogo offline; nunca es la fuente de verdad de qué bañera llevó un viaje concreto (eso vive en el viaje mismo, ver abajo).
TransportDeparture: banieraId Int? @relation(fields:[banieraId], references:[id], onDelete: SetNull) — bañera física verificada al salir de cantera. También vehicleId no se toca aquí (ya vive en TransportTrip).
TransportArrival: banieraId Int? (misma relación) y vehicleId Int? (nueva) — este es el fix del hallazgo #1: se graba qué vehículo y qué bañera llegaron realmente, sin importar si coinciden con los de la salida.
TransportArrivalPending: banieraId Int? — para que la bañera detectada en una llegada huérfana no se pierda mientras espera emparejamiento manual/automático.
TransportTrip: sin cambios estructurales; sigue siendo "la salida" como ancla del viaje. Opcionalmente, un campo calculado/leído en el flatten (flatten-trip.ts) que compare departure.vehicleId (vía trip.vehicleId) contra arrival.vehicleId y departure.banieraId contra arrival.banieraId para mostrar en UI "⚠ cambió de vehículo en ruta" / "cambió de bañera en ruta" — informativo, no bloqueante (confirma la decisión ya tomada de no alertar automáticamente, solo hacerlo visible).
Reutilizar exactamente el patrón ya probado de Vehicle/VehicleQRCode/VehicleSequence y del servicio de generación de QR (backend/src/vehicles/vehicles.service.ts: generateBatch, generateQRWithText, getAvailableQRCodes, generateNewQRForVehicle, detachQRCode) — se copian a un banieras.service.ts nuevo con la misma lógica, solo cambiando el modelo y el prefijo de secuencia (BA).

2. Backend (NestJS)
2.1 Nuevo módulo banieras
backend/src/banieras/ con banieras.module.ts, banieras.controller.ts, banieras.service.ts, DTOs/create-baniera.dto.ts, update-baniera.dto.ts — calcado de backend/src/vehicles/. Endpoints análogos:

CRUD estándar.
POST generate-batch (genera N QR).
GET qrcodes/available, GET qrcode/:banieraId, POST :banieraId/generate-new-qr, PATCH :banieraId/detach-qr.
GET :banieraId/history — viajes (departures/arrivals) donde apareció esa bañera, y con qué vehículo cada vez (para el "historial de qué vehículo la ha llevado" pedido).
2.2 Extender transport-log
submit-departure.dto.ts / submit-arrival.dto.ts: agregar banieraId?: string (numérico) y banieraQrcode?: string (alternativa offline, mismo patrón que qrcode/vehicleId ya existente).
submitDeparture (línea ~159-263): resolver bañera igual que se resuelve vehículo hoy (por id o por QR), guardarla en TransportDeparture.banieraId. Si la bañera está DANADA/INACTIVA, rechazar con BusinessException clara (mismo patrón que VEHICLE_INACTIVE).
submitArrival (línea 549 en adelante): resolver bañera de la llegada igual, guardar en TransportArrival.banieraId. Agregar también vehicleId real de la llegada al create de TransportArrival (hoy ausente, ver hallazgo #1) tanto en el flujo directo (líneas 943-961) como en closeTripWithPendingArrival (líneas 296-332) y en el guardado a TransportArrivalPending (líneas 814-832, agregar banieraId).
getByQrCode / flujo CONTINUE_TO_ARRIVAL: sin cambios de fondo, solo propagar bañera actual del vehículo (banieraActualId) en la respuesta para que la app pueda preseleccionarla (ver móvil, sección 3).
flattenTrip (flatten-trip.ts): incluir bloques departureBaniera / arrivalBaniera y arrivalVehicle en la respuesta aplanada que ya usan reportes y frontend.
getCatalog() (línea 1916): agregar banieras (catálogo activo) y el campo banieraActualId embebido en cada vehicle — mismo criterio que ya se usa para vehículos/materiales/plannings, es un reemplazo completo de caché.
reassignTrip (línea ~1780): permitir opcionalmente reasignar también banieraId (mismo patrón de auditoría con observation/motivo obligatorio que ya existe para vehículo/chofer).
2.3 Reconciliación
reconciliation.service.ts: no cambia su criterio de emparejamiento (sigue siendo por vehículo + tiempo, que es correcto: la bañera no debe ser parte del criterio de matching, solo un dato que viaja junto). Único cambio: al cerrar (closeTripWithPendingArrival), copiar pending.banieraId y pending.vehicleId al TransportArrival.create (ver 2.2).
manual-match / ConciliacionPanel.tsx: mostrar en cada fila de "llegada sin salida" qué bañera trae (además de placa/vehículo), para que el jefe tenga contexto completo al decidir el emparejamiento manual.
ReassignTripModal.tsx: agregar selector de bañera junto al de vehículo/chofer que ya tiene, reusando el mismo componente de selección que se construya para bañeras (ver 3.1).
2.4 Reportes
backend/src/reports/reports.service.ts: en cada reporte que hoy arma un bloque vehicle: {...} a partir del trip (los 8 métodos listados en la exploración: getOwnerTransportReport, getVehicleDetailReport, getTotalM3ByConstSite, getTotalM3ByPlanning, getClientTransportReport, getSupervisorReport, getMaterialByConstSite, getMaterialProviderReport, getMaterialByPlanning), agregar banieraSalida / banieraLlegada (y vehiculoLlegada cuando difiera del de salida) leídos de departure.baniera / arrival.baniera / arrival.vehicle. Reutilizar el mismo include que ya traen para vehicle, solo añadiendo las relaciones nuevas.

3. Frontend web (React)
3.1 Nuevo módulo modules/banieras
Calco de modules/vehicles (components/, hooks/, services/, types/): página de listado con filtro por estado (activa/dañada/en reparación/inactiva), formulario crear/editar (código, capacidad, ejes, estado, observación), botón de generación de QR en lote (idéntico al de Vehículos), vista de detalle con historial de vehículos que la han llevado (consumiendo GET :banieraId/history).

Se necesita un BanieraSelector.tsx reutilizable (análogo a planificacion/components/VehicleSelector.tsx / DriverSelector.tsx) para usarlo en: ReassignTripModal.tsx, y opcionalmente en PlanificacionForm.tsx si se quiere poder preasignar una bañera "de referencia" a un vehículo dentro de la planificación (esto alimentaría Vehicle.banieraActualId, no es obligatorio para el primer entregable).

3.2 Registro de Transporte (vista jefe/admin)
TransportLogPage.tsx / TransportLogJefePage.tsx y sus PDFs (transportLogPdf.ts, transportLogJefePdf.ts): agregar columnas de bañera de salida/llegada, y resaltar visualmente (sin bloquear) cuando difieren entre sí o cuando el vehículo de llegada difiere del de salida — es la señal visible que reemplaza a la "alerta automática" que el negocio decidió NO activar.

3.3 Router y menú
Agregar entrada "Bañeras" en AppRouter.tsx y en el menú de navegación, con los mismos roles que ya pueden entrar a "Vehículos".

4. App móvil (Android, Kotlin, offline-first)
Este es el punto más delicado: todo debe seguir funcionando sin internet, con el mismo patrón de outbox que ya usan PendingDeparture/PendingArrival.

4.1 Room: nuevas entidades y migración explícita
Siguiendo el patrón ya usado en AppDatabase.kt (MIGRATION_6_7, MIGRATION_7_8, nunca destructivo para datos de campo):

Nueva entidad CachedBaniera.kt (id, code, plate, capacity, axles, status, isActive) — catálogo descargado en el sync matutino.
Nueva entidad CachedBanieraQrCode.kt (qrcode → banieraId) — igual que CachedQrCode.kt pero para bañeras.
CachedVehicle.kt: agregar banieraActualId: Int? y banieraActualCode: String? (bañera de referencia, para precargar el formulario).
PendingDeparture.kt: agregar banieraId: Int?, banieraQrcode: String?.
PendingArrival.kt: agregar banieraId: Int?, banieraQrcode: String? — y, para el caso de cambio de cabezal, este archivo ya tiene vehicleId/qrcode propios (independientes de la salida), así que no necesita cambio estructural para soportar vehículo distinto: ya lo soporta.
MIGRATION_8_9 nueva: ALTER TABLE ... ADD COLUMN para cada campo de arriba (todos nullable, sin default forzado — mismo criterio que MIGRATION_7_8), más las tablas nuevas cached_baniera y cached_baniera_qrcode (Room las crea solas al agregarlas a entities=[...], pero igual hay que subir version = 9 y registrar la migración con CREATE TABLE explícito para no gatillar fallbackToDestructiveMigration() sobre las tablas de pendientes).
4.2 Sincronización de catálogo
data/repo/CatalogRepository.kt (syncCatalog): agregar clearBanieras()/ insertBanieras() dentro de la misma db.withTransaction { ... } atómica que ya existe, igual que el resto de catálogos. Network.kt: extender CatalogResponse con banieras: List<CatalogBanieraData> y CatalogVehicleData con banieraActualId/ banieraActualCode. Backend: ver 2.2 (getCatalog()).

4.3 Flujo de escaneo (UI)
ElegirRegistro.kt hoy escanea un solo QR (el del vehículo) y navega a RegistroSalida/RegistroLlegada. Se agrega un segundo escaneo opcional de la bañera, en la propia pantalla de salida/llegada (no en ElegirRegistro, para no acoplar los dos escaneos y permitir que la bañera se registre "no sé cuál es todavía" y se complete después si hiciera falta — aunque el flujo normal es escanear ambas antes de guardar):

RegistroSalida.kt: nuevo botón "Escanear bañera" (reutiliza ScanContract/ ScanOptions ya integrados con ZXing). Al escanear, resuelve contra CachedBanieraQrCode local (mismo patrón que findVehicleForQr en CatalogRepository.kt). Precarga automáticamente con vehicle.banieraActualId si el supervisor no escanea nada (bañera "de referencia" del catálogo), pero permite sobreescribir escaneando la real. Guarda banieraId/banieraQrcode en el PendingDeparture al confirmar.
RegistroLlegada.kt: mismo botón "Escanear bañera", independiente de la bañera de salida (puede no conocerse en este celular si es un dispositivo distinto al de cantera). Guarda en PendingArrival.
Capacidad efectiva (m³) mostrada en el formulario (tvCapacidadTexto/tvCapacidadTotal/etCantidad.hint, líneas ~457-509 de RegistroSalida.kt, análogo en RegistroLlegada.kt): si hay bañera escaneada, usar baniera.capacity; si no, mantener el fallback actual (vehicleData.capacity) — así ningún flujo existente sin bañera se rompe.
Si la bañera escaneada tiene status != ACTIVA (dañada/en reparación/inactiva) en el catálogo local, mostrar advertencia pero no bloquear el registro (el supervisor puede estar confirmando precisamente que la están retirando) — decisión consistente con "se permite y queda registrado" del punto 2 de la conversación.
4.4 Cambio de cabezal en ruta (celular de OBRA)
No requiere pantalla nueva: el flujo ya existente de ElegirRegistro.kt en rol OBRA (líneas 226-260) ya escanea el QR del vehículo que físicamente llega, sin exigir que coincida con ningún viaje abierto de ESE vehículo (matchFound = res.data != null, y si es false igual continúa a RegistroLlegada con tripData vacío). Es decir: la app ya deja registrar la llegada de un vehículo distinto al que salió — el emparejamiento se resuelve después en el backend/backoffice (sección 2.3). Lo único a reforzar aquí:

Mensaje explicativo en el diálogo cuando matchFound == false ("no se encontró una salida abierta para este vehículo — puede ser normal si el vehículo cambió en el camino; el registro igual se guardará y se emparejará"), para que el supervisor no lo interprete como error y reintente escaneando de más.
Asegurar que resolverVehiculoOffline (líneas 117-188) también intente resolver bañera actual del vehículo cacheado, igual que hace con datos del vehículo.
4.5 Sincronización saliente (SyncWorker)
sync/SyncWorker.kt: extender el multipart de createDeparture/registerArrival con los campos banieraId/banieraQrcode cuando estén presentes — mismo mecanismo de reintentos, backoff y reclamo atómico ya existente, sin tocar su lógica (los campos nuevos son opcionales en el DTO del backend, así que celulares con la app vieja durante el rollout siguen funcionando sin enviar bañera).

5. Fases de despliegue (sistema en producción)
Dado que todo está en producción, desplegar en este orden para que cada fase sea reversible y no dependa de que TODOS los celulares se actualicen a la vez:

Backend, aditivo puro: migración Prisma (todo nullable), módulo banieras nuevo, campos opcionales en DTOs de submit-departure/submit-arrival/getCatalog. Se puede desplegar solo, sin que nada del frontend ni la app móvil lo use todavía — cero riesgo para lo que ya funciona.
Frontend web: módulo Bañeras (CRUD + generación de QR) para que el equipo empiece a cargar el catálogo de bañeras físicas y pegar los QR impresos ANTES de que la app móvil los pida. Extender reportes y conciliación para mostrar bañera cuando exista (si no hay dato, simplemente no se muestra esa columna — no rompe reportes viejos).
App móvil: nueva versión con Room v9, escaneo de bañera y capacidad efectiva. Se distribuye de forma gradual; mientras conviven versiones viejas y nuevas, el backend ya soporta ambas (bañera es opcional en los DTOs).
Activación operativa: una vez todos los celulares estén actualizados y las bañeras tengan su QR físico pegado, capacitar a los supervisores en el escaneo doble (vehículo + bañera) y en el uso del panel de conciliación para los casos de cambio de cabezal.
6. Riesgos y decisiones abiertas (para confirmar antes de picar código)
Liberación del QR del cabezal dañado: cuando el material termina llegando en otro camión, el vehículo original queda con su QR en estado OCUPADO indefinidamente salvo que un admin lo libere a mano (vía reassignTrip o marcándolo inactivo). Se recomienda agregar una acción explícita "Marcar vehículo/bañera como dañado en ruta" en el CRUD web, que libera el QR y cambia el estado, en vez de dejarlo como tarea manual implícita.
banieraActualId en Vehicle: es solo una referencia informativa para precargar en campo; no se actualiza automáticamente cuando cambian bañeras en un viaje (eso requeriría definir "cuándo se considera que el cambio es permanente vs. solo para ese viaje", que el negocio no ha determinado). Se deja como campo editable manualmente desde el CRUD de Vehículos/Bañeras, actualizado por el equipo de patio, no automáticamente.
Bañeras sin placa propia: el schema permite plate nula por si algunas bañeras no tienen placa registrada legalmente — confirmar con el Excel de datos si todas las bañeras existentes tienen placa o no, para saber si plate debe ser obligatoria.
7. Verificación
Migraciones Prisma: npx prisma migrate dev en local contra una copia de la base actual (no contra producción), confirmar que no se pierde ninguna fila existente en Vehicle/TransportDeparture/TransportArrival.
Backend: pruebas manuales de POST /transport/departure y /arrival con y sin banieraId/banieraQrcode, confirmando compatibilidad hacia atrás (payload sin esos campos sigue funcionando igual que hoy).
Simular en el panel de Conciliación un emparejamiento manual salida-vehículo-A / llegada-vehículo-B con bañeras distintas en cada punta, y confirmar que el viaje cerrado muestra correctamente ambos vehículos y ambas bañeras en el reporte de detalle.
App móvil: probar el flujo completo en modo avión (sin datos) — escanear vehículo, escanear bañera, guardar salida; luego llegada con OTRO vehículo y OTRA bañera; reactivar datos y confirmar que ambos registros sincronizan y llegan completos al backend.