# Plan — PDF de planificación, códigos de viaje y filtros de ventas

## Contexto

El usuario pidió cuatro mejoras para ordenar el sistema:

1. Un PDF por planificación con todos sus datos, sin la distancia ni el tiempo
   estimado.
2. Ver el código de la planificación (`PLAN-0001-2026`) en Registro de
   Transporte y arriba a la izquierda del PDF.
3. Un código autoincrementable por cada viaje, tanto de transporte como de
   venta, mostrando además a qué planificación u orden pertenece.
4. En Reportes → Ventas, filtrar por cliente, por orden y por código de viaje,
   y mostrar el código de cada viaje. El código de la orden y el del viaje
   también deben verse en los detalles de "Venta de material".

### Lo que ya existe

- **Planificación:** tiene `planningCode` (`PLAN-0001-2026`), generado por año
  con la tabla `PlanningSequence`. La pantalla de Planificación ya lo muestra
  como "ID".
- **Viajes de transporte:** cada viaje ya trae su `planning` (con
  `planningCode`) desde el backend. La tabla de Registro de Transporte no lo
  muestra, pero el Excel sí, mediante el helper `getPlanningLabel`.
- **Ventas:** traen `orden { id, codigo }` en todos los listados. "Venta de
  material" ya muestra la orden en su tabla y en el detalle.
- **Códigos de viaje:** ni `TransportTrip` ni `VentaCantera` tienen uno; solo
  tienen el `id` interno.
- **Patrón a copiar para los códigos:** `generarCodigo` en
  `ventas-ordenes.service.ts:255` (contador por año con upsert + increment
  dentro de la transacción).
- **Patrón a copiar para el PDF:** `ventas-ordenes/utils/ventaOrdenPdf.ts`.

### Decisiones del usuario

- Códigos de viaje para **ambos**: transporte y venta.
- Filtro en Reportes → Ventas por **cliente**, **orden** y **código de viaje**.
- El PDF de planificación lleva: datos generales, vehículos, consumo de
  material y viajes realizados.
- El identificador de planificación que se muestra es **`PLAN-0001-2026`**.

### Cobertura de lo pedido

| Pedido | Dónde queda en el plan |
|---|---|
| Planificación del viaje de transporte (`PLAN-0002-2026`) en la grilla web | Columna "Planificación" en Registro de Transporte y en Jefe (§3) |
| Planificación del viaje de transporte en su PDF | Encabezado de `transportLogPdf.ts` y `transportLogJefePdf.ts` (§3) |
| Código de viaje de transporte y de venta, en el límite izquierdo | Primera columna de cada grilla y arriba a la izquierda en cada PDF (§3) |
| PDF individual por viaje de venta, con su orden | **PDF nuevo** `ventaPdf.ts`; hoy no existe (§3) |
| Orden a la que pertenece cada viaje de venta | Ya se ve en la grilla de Venta de material y en Reportes; se agrega en Movimientos de stock y en el PDF (§3) |
| Código de orden en los detalles del viaje | Ya está en el detalle de Venta de material; se agrega junto al código del viaje y en el PDF (§3) |

## 1. Esquema y migración (solo `sct_qa` local)

`backend/prisma/schema.prisma` + `migrations/<ts>_add_codigo_viajes/migration.sql`:

- **`TransportTrip.codigo String? @unique`**: formato `TRA-00001-2026`.
  Contador nuevo `TransportTripSequence { id, year @unique, last }`.
- **`VentaCantera.codigo String? @unique`**: formato `VEN-00001-2026`.
  Contador nuevo `VentaCanteraSequence { id, year @unique, last }`.
- **El SQL de la migración asigna código a los registros existentes:**
  - numera con `ROW_NUMBER() OVER (PARTITION BY año ORDER BY fecha, id)`,
    usando `departureAt` en viajes y `capturedAt` en ventas;
  - inicializa cada contador con el máximo de cada año.
- Los campos quedan opcionales a nivel de base para no romper la creación si
  algo falla; en la práctica todo registro nuevo recibe código.

**Aplicación local:**
1. `db push --skip-generate`.
2. Ejecutar el mismo SQL de numeración con `prisma db execute --file`, solo
   contra `sct_qa`.
3. `migrate resolve --applied`.
4. `prisma generate`, deteniendo antes el backend en `--watch` si bloquea los
   archivos.

Nunca usar shadow DB ni `migrate dev`. En producción, `migrate deploy` ejecuta
la misma migración con la numeración incluida.

## 2. Backend

### Generación de códigos

- Helper compartido `src/common/codigo-secuencial.ts`:
  ```ts
  formatearCodigo(prefijo, numero, anio) // => 'TRA-00001-2026'
  ```
  más una función por tabla que hace el upsert + increment del contador
  dentro de la transacción recibida (`tx`). Es el mismo patrón que
  `generarCodigo` de órdenes.
- **Año del código:** se toma de la fecha real del viaje (`capturedAt`) en
  hora de Ecuador, no de la fecha de sincronización. Así una salida offline del
  31/12 que sincroniza el 2 de enero queda con el año correcto.
- **`transport-log.service.ts` `submitDeparture` (~L476):** generar el código
  dentro de la transacción antes del `transportTrip.create`. El reenvío
  idempotente ya devuelve antes de llegar ahí, así que no gasta números.
- **`ventas.service.ts` `create` (~L280):** dentro de la transacción, buscar
  primero por `uuid`. Solo si no existe se genera el código y se pasa a
  `create` del upsert, para que un reenvío de la app no consuma un número.

### Planificación (punto 1)

- `plannings.service.ts` `findOne` (L353): incluir `vehicle.driver` (hoy el
  detalle siempre dice "Sin conductor").
- Endpoint nuevo `GET /plannings/:id/viajes`, protegido como el resto de los GET
  de plannings (solo autenticación). Devuelve los viajes de la planificación
  que no estén `CANCELADO`, con estos campos: `codigo`, `departureAt`,
  `arrivalAt`, `status`, vehículo (placa e ID), conductor, material,
  m³ de salida y de llegada.
- El consumo de material reutiliza el endpoint existente
  `GET /plannings/:id/consumo-material`.

### Ventas (puntos 3 y 4)

- `QueryVentasDto`: agregar `compradorId` (opcional) y aplicarlo en `findAll`.
  Así el reporte (`reporteConsumo`, que llama a `findAll`) filtra por cliente
  sin más cambios. `ordenId` ya existe.
- `ventas-stock.service.ts` (~L318, movimientos): agregar `codigo` y
  `orden { codigo }` al `select` de `venta`.
- `ventas-ordenes.service.ts` (`ORDEN_INCLUDE` ventas, L28): agregar `codigo`
  para que los despachos de la orden muestren el código del viaje.

## 3. Frontend

### Planificación — `frontend/src/modules/planificacion/`

- **Archivo nuevo `utils/planificacionPdf.ts`**, copiando el patrón de
  `ventaOrdenPdf.ts` (logo, encabezado, `addSection`, autoTable).
  - **Encabezado:** arriba a la izquierda va el logo y debajo el código
    `PLAN-0001-2026` en grande. A la derecha, título, fecha de emisión y
    "Generado por".
  - **Datos generales:** obra, cliente (razón social y RUC), fechas de inicio y
    fin, estado, descripción y N° de factura. Sin distancia ni tiempo
    estimado.
  - **Vehículos:** tabla con N°, ID vehículo, placa, conductor, capacidad m³,
    tipo (Interno/Externo), empresa o propietario, y cantera. Al pie, totales
    de internos, externos y total.
  - **Consumo de material** por cantera: asignado, consumido y disponible.
  - **Viajes realizados:** código de viaje, salida, llegada, placa, material,
    m³ de salida y de llegada.
  - Se guarda como `Planificacion_PLAN-0001-2026.pdf`.
- **`components/PlanificacionPage.tsx`:** botón "PDF" en las acciones de cada
  fila y otro en el modal de detalle. Al pulsarlo se cargan `getById`, el
  consumo y los viajes, y se genera el PDF con un toast de carga. Mismo flujo
  que `handleDownloadPdf` de Registro de Transporte.
- **Modal de detalle:** el conductor ahora sale con nombre.
- **Servicio:** agregar `getViajes(id)`. **Tipos:** `driver` en el vehículo.

### Registro de Transporte (puntos 2 y 3)

- **`registro-transporte/types/index.ts`:** agregar `codigo` y
  `planning.planningCode`.
- **`TransportLogPage.tsx`:**
  - Columnas nuevas al inicio: **"Código"** (código del viaje) y
    **"Planificación"** (`row.planning?.planningCode`, o "—" si no tiene).
  - El buscador encuentra también esos dos textos.
  - Detalle del viaje: el código se muestra arriba.
  - El Excel suma la columna del código.
- **`utils/transportLogPdf.ts`:** en el encabezado, arriba a la izquierda
  debajo del logo, van el código del viaje (`TRA-00001-2026`) y la
  planificación (`PLAN-0002-2026`). En "Datos generales" también va la
  planificación.
- **`registro-transporte-jefe/`:** los mismos cambios en su tabla (columnas
  "Código" y "Planificación" al inicio), tipos, detalle y en
  `transportLogJefePdf.ts`.

### Ventas (puntos 3 y 4)

- **`ventas/types/index.ts`:** agregar `codigo` a la venta y `compradorId` a
  `VentaFilters`.
- **`VentasPage.tsx` ("Venta de material"):**
  - Columna **"Código"** al inicio de la tabla.
  - Detalle de la venta: código del viaje junto al código de la orden, que ya
    se muestra.
  - El buscador encuentra también el código de viaje.
  - El Excel suma la columna del código.
- **PDF individual por viaje de venta (nuevo): `ventas/utils/ventaPdf.ts`.**
  Hoy no existe. Sigue el patrón de `transportLogPdf.ts`.
  - **Encabezado:** arriba a la izquierda, debajo del logo, el código del viaje
    (`VEN-00001-2026`) y la orden a la que pertenece (`ORD-0002-2026`, o "Sin
    orden"). A la derecha, título, fecha de emisión y "Generado por".
  - **Datos:**
    - cantera y proveedor;
    - vehículo: ID, placa, tipo y chofer;
    - material y m³;
    - fecha y hora del despacho;
    - comprador y RUC, obra y orden;
    - observación, registrado por y coordenadas.
  - **Fotos**, si las tiene, igual que en el PDF de transporte.
  - **Botón "PDF"** en las acciones de cada fila de Venta de material y en el
    modal de detalle.
  - Se guarda como `Venta_VEN-00001-2026.pdf`.
- **`VentaStockModal.tsx` (Movimientos):** en las salidas por venta, mostrar
  código de viaje y código de orden en "Detalle".
- **`ReporteVentasSection.tsx` (Reportes → Ventas):**
  - **Filtro "Cliente":** SearchableSelect con `useClientes`. Se envía
    `compradorId` al backend.
  - **Filtro "Orden":** opciones tomadas de `reporte.porOrden`, calculadas sin
    el filtro de orden aplicado. Se envía `ordenId` al backend, así los totales
    y las tablas agrupadas también se filtran.
  - **Buscador "Código de viaje":** filtra el Historial de despachos en
    pantalla.
  - Historial de despachos: columna **"Código"** al inicio.
  - El Excel suma el código.
- **`ventas-ordenes`:** los despachos del detalle de la orden y la tabla de
  vehículos del PDF de la orden muestran el código de viaje.

## 4. Pruebas

- **Backend:**
  - Generación de códigos: formato, año tomado de la fecha real, y que el
    reenvío idempotente de una venta no genere código nuevo.
  - Filtro `compradorId` en `findAll`.
  - Endpoint de viajes de la planificación: excluye los `CANCELADO`.
  - Actualizar los mocks de los tests de `submitDeparture` y de ventas
    `create` para el contador nuevo.
- **Base esperada:** `tsc` limpio y `jest` con 15 suites y 14 pruebas fallando
  (los mismos archivos de siempre), con más pruebas pasando.
- **Frontend:** `typecheck` con 29 errores preexistentes y ninguno nuevo, y
  `build` limpio.

## 5. Verificación manual (local)

- **Numeración:** confirmar en `sct_qa` que todos los viajes y ventas
  existentes tienen código único y que los contadores quedaron en el máximo.
- **Creación nueva:** crear por API una salida y una venta, y confirmar que
  reciben el código siguiente. Reenviar la misma venta y confirmar que no
  consume número.
- **PDF de planificación:** descargarlo y revisar el código arriba a la
  izquierda, los datos generales, los vehículos con conductor, el consumo y
  los viajes.
- **PDF de viaje de transporte:** código del viaje y planificación arriba a la
  izquierda.
- **PDF de viaje de venta:** código del viaje y orden arriba a la izquierda.
- **Pantallas:** en Registro de Transporte, ver las columnas Código y
  Planificación. En Reportes → Ventas, filtrar por cliente, por orden y por
  código de viaje.
