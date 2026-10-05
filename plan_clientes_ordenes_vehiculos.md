# Plan — Cliente que arma obra y proveedor solos, y vehículos en la orden

## Contexto

Hoy, para crear una orden de venta hay que pasar por varios CRUD: crear el
cliente, luego la obra, luego el proveedor (si el cliente es externo) y
escribir las placas como texto libre en la orden. El usuario quiere una ruta
corta:

1. **Al crear un cliente** (público o privado; todos tienen RUC y razón social)
   se crea en la misma operación su **obra**, con la razón social como nombre y
   ya vinculada al cliente. Los demás campos de la obra quedan vacíos.
2. **Si el cliente es público**, además se crea un **proveedor de vehículos**
   (`Owner`) con el mismo RUC y la misma razón social.
3. **En la orden**, el cliente y la obra se eligen como hoy. El campo de texto
   "Placas" se reemplaza por una lista de **vehículos reales**:
   - **Cliente público:** se escriben placa y cubicaje (m³) y Enter. El
     vehículo se crea en Vehículos como EXTERNO, con el proveedor del cliente y
     el ID automático `TE-00001`.
   - **Cliente privado:** se busca un vehículo de la empresa por ID o placa (se
     ve su cubicaje). Si no existe, se crea ahí mismo con ID (TCR/TVL), placa,
     m³ y empresa.

### Hallazgos del análisis

- **Crear un cliente no crea nada más.** `ClientsService.create`
  (`clients.service.ts:8`) solo inserta el cliente.
- **Sin vínculo cliente → proveedor.** `Client` y `Owner` no tienen relación en
  la base. El usuario eligió vincularlos por RUC.
- **Duplicados.** `Owner.ruc` es único pero opcional. Un RUC repetido en
  `Client` u `Owner` sale hoy como un error 500 genérico, porque no hay manejo
  del error P2002.
- **Vehículo con solo placa y m³.** Hoy no se puede crear así: `brand`, `model`
  y `year` son obligatorios en la base. El usuario eligió volverlos opcionales.
- **Formatos de placa.** El ID externo `TE-00001` ya se genera solo
  (`generateNextExternalVehicleId`, `vehicles.service.ts:32`). El vehículo
  guarda la placa como `ABC1234` y la orden como `ABC-1234`.
- **La orden no se vincula a vehículos.** `VentaOrden.placas` es solo texto. La
  app móvil no lee las placas de la orden, así que cambiarlas no la afecta.

### Decisiones del usuario

| Tema | Decisión |
|---|---|
| Obra automática | Para **todos** los clientes, públicos y privados. |
| Proveedor automático | Solo para clientes **públicos**, con el mismo RUC y razón social. |
| Vínculo cliente → proveedor | Por **RUC** (sin cambios en `Client`). |
| Marca, modelo y año del vehículo | Pasan a **opcionales**. |
| Vehículo privado inexistente | Se **crea desde la orden** (ID, placa, m³, empresa). |
| Vehículos en la orden | **Vinculados a la orden** (lista real, no solo texto). |
| Clientes existentes | **No se tocan**. Si un cliente público existente no tiene proveedor, se crea al agregar su primer vehículo externo. |

## 0. Guardar el plan en el proyecto

Primer paso: copiar este plan a la raíz como
`plan_clientes_ordenes_vehiculos.md`, junto a los otros planes.

## 1. Esquema y migración (solo `sct_qa` local)

`backend/prisma/schema.prisma` + `migrations/<ts>_add_orden_vehiculos/migration.sql`:

- **`Vehicle`:** `brand`, `model` y `year` pasan a `String?`.
- **Modelo nuevo `VentaOrdenVehiculo`:** `id`, `ordenId` (→ VentaOrden,
  onDelete Cascade), `vehicleId` (→ Vehicle), `createdAt`, con
  `@@unique([ordenId, vehicleId])`. Se agregan las relaciones inversas
  `VentaOrden.vehiculos` y `Vehicle.ordenesVenta`.
- **`VentaOrden.placas` se mantiene:** las órdenes viejas siguen mostrando sus
  placas de texto. Las nuevas usan la lista de vehículos.

**Aplicación:**
1. `db push --skip-generate`.
2. `migrate resolve --applied`.
3. `prisma generate`.

Nunca usar shadow DB ni `migrate dev`. Antes de cada paso, revisar el aviso de
`db push`. Solo base local.

## 2. Backend

### 2.1 Cliente que crea su obra y proveedor — `clients/clients.service.ts`

`create` corre todo dentro de una transacción (`prisma.$transaction`):

1. Crear el `Client` (igual que hoy, tipo por defecto PRIVADO).
2. Crear la `ConstSite` con `name = companyname` y la fila en
   `ClientConstSite` que la vincula con el cliente.
3. Si `type === 'PUBLICO'`, ejecutar `asegurarProveedorPorRuc(tx, ruc,
   companyname)` (helper nuevo, ver 2.2):
   - busca un `Owner` con ese RUC;
   - si no existe, lo crea con `ruc` y `companyname`;
   - si ya existe, lo reutiliza: un cliente puede ya haber sido proveedor.

**Errores:** un P2002 (RUC o razón social del cliente repetidos) sale como 409
con un mensaje claro, del tipo "YA EXISTE UN CLIENTE CON ESE RUC". Se sigue el
patrón de `drivers.service.ts:106`.

**Respuesta:** el cliente con su obra (`constSites.constSite`) y, si es
público, el proveedor.

**Permisos:** solo exige `clients:create`, porque todo ocurre dentro del mismo
servicio.

### 2.2 Helper compartido de proveedor

`backend/src/owners/proveedor-por-ruc.ts` expone
`asegurarProveedorPorRuc(tx, ruc, razonSocial)`, usado por el cliente (2.1) y
por la orden (2.3).

### 2.3 Vehículos desde la orden — `ventas/ventas-ordenes.service.ts`

**Endpoint nuevo `POST /ventas/ordenes/vehiculo`**, con permiso
`ventas-ordenes:create`.

Body (`ResolverVehiculoOrdenDto`):

| Campo | Tipo | Obligatorio |
|---|---|---|
| `clientId` | número | sí |
| `plate` | texto | sí |
| `capacity` | número > 0 | sí |
| `vehicleid` | texto | solo para crear un vehículo privado |
| `company` | `CIUDAD_RODRIGO` o `TRANSVELEZ` | solo para crear un vehículo privado |

Lógica:

1. **Normalizar la placa** a `ABC1234` (sin guion, en mayúsculas), con el mismo
   criterio que `normalizePlate` del frontend. Validar el formato
   `^[A-Z]{3}\d{3,4}$` (400 si no cumple).
2. **Si ya existe un vehículo con esa placa,** se devuelve tal cual. No se
   duplica ni se pisa su cubicaje.
3. **Cliente PÚBLICO:**
   - se asegura el proveedor con `asegurarProveedorPorRuc` usando el RUC del
     cliente;
   - se crea el vehículo `EXTERNO` con
     `vehiclesService.generateNextExternalVehicleId()`, la placa, `capacity` y
     `ownerId`.
4. **Cliente PRIVADO:**
   - exige `vehicleid` y `company`;
   - valida que el `vehicleid` no exista;
   - crea el vehículo `INTERNO`.
5. **Errores:** un P2002 de placa o `vehicleid` sale como 409 con mensaje
   claro.

**`VehiclesModule` exporta `VehiclesService`** para reusar el generador de ID.
Su lectura e incremento del contador pasan a ejecutarse en transacción, para
que dos usuarios a la vez no saquen el mismo número.

### 2.4 La orden guarda sus vehículos

- **DTOs** (`venta-orden.dto.ts`): `CreateVentaOrdenDto` y
  `UpdateVentaOrdenDto` reciben `vehicleIds?: number[]` (`@IsArray`,
  `@IsInt({ each: true })`). `placas` sigue aceptándose para no romper nada.
- **`create`:** valida que los vehículos existan y crea las filas
  `VentaOrdenVehiculo` en la misma transacción.
- **`update`:** si viene `vehicleIds`, sincroniza la lista (borra las que
  sobran, agrega las nuevas). Cambiarla cuenta como edición: actualiza
  `editadoPorId` / `editadoEn` igual que hoy.
- **`ORDEN_INCLUDE`:** incluye
  `vehiculos { vehicle { id, vehicleid, plate, capacity, type } }`.
- **Telegram** (`telegram.service.ts:192`): la línea "Placas:" pasa a
  "Vehículos:" con `placa (m³)`. Si la orden no tiene vehículos, usa las
  placas viejas.

### 2.5 Vehículo con datos opcionales

`vehicles.service.ts` y cualquier lugar que use `brand`, `model` o `year`
deben tolerar null. El compilador marca cada lugar al cambiar el tipo; se
corrigen con `?? '—'` donde se muestran (reportes, PDF).

## 3. Frontend

### 3.1 Clientes — `frontend/src/modules/clientes/`

- **`ClienteForm.tsx`:** al crear, mostrar una nota bajo "Tipo de cliente":
  - **Público:** "Se creará su obra y su proveedor con esta razón social y
    RUC."
  - **Privado:** "Se creará su obra con esta razón social."
- **`ClientesPage.tsx`:** el toast de éxito confirma lo creado. Los mensajes de
  error ya muestran el texto del backend.

### 3.2 Orden de venta — `ventas-ordenes/components/VentaOrdenForm.tsx`

Se reemplaza el campo "Placas de vehículos" por el bloque **"Vehículos de la
orden"**, que depende del tipo del cliente elegido:

- **Cliente público:**
  - Dos campos en línea: "Placa" y "m³". Enter en m³ (o el botón "Agregar")
    llama a `POST /ventas/ordenes/vehiculo`.
  - La fila queda en la lista con ID (`TE-…`), placa y m³, y un botón para
    quitarla.
  - Al agregar se limpian los campos y el foco vuelve a "Placa", para cargar
    varios seguidos.
- **Cliente privado:**
  - Un SearchableSelect de vehículos internos (`vehicleService.getAll`,
    filtrado a INTERNO y activos), con la etiqueta `ID · placa · m³`. Al
    elegir uno se agrega a la lista.
  - Un enlace "Nuevo vehículo de la empresa" abre campos en línea: ID,
    empresa, placa y m³. Enter crea el vehículo con el mismo endpoint.
- **Sin cliente elegido:** el bloque se ve deshabilitado con la nota "Elige
  primero el cliente".
- **No se repiten vehículos:** si se agrega uno que ya está en la lista, se
  avisa.
- **Al guardar:** el formulario envía `vehicleIds`. Al editar, la lista arranca
  con los vehículos actuales de la orden.
- **Archivos auxiliares:**
  - `services/ventaOrdenesService.ts`: `resolverVehiculo(...)`, y
    `vehicleIds` en create y update.
  - `types/index.ts`: `vehiculos` en `VentaOrden`, `vehicleIds` en el
    formulario.

### 3.3 Detalle, Excel y PDF de la orden

- **`VentaOrdenesPage.tsx`:** el detalle muestra "Vehículos" (ID, placa, m³),
  o las placas viejas si la orden no tiene vehículos. El Excel usa lo mismo.
- **`utils/ventaOrdenPdf.ts`:** "Placas informadas" pasa a "Vehículos
  asignados" (ID, placa, m³), con la misma regla de respaldo a las placas
  viejas.

### 3.4 Vehículos

`VehiclesPage` y `VehicleForm` muestran `—` cuando falta marca, modelo o año.
El tipo `Vehicle` pasa esos campos a opcionales.

## 4. Pruebas

**Backend:**

- **`clients.service`:** al crear un cliente se crean obra y vínculo. Si es
  público, se crea el proveedor, o se reutiliza si ya existía con ese RUC. Un
  RUC repetido devuelve 409.
- **Endpoint de vehículo de la orden:**
  - placa existente → devuelve el vehículo sin duplicarlo;
  - cliente público → crea `EXTERNO` con `TE-` y el proveedor, creando el
    proveedor si faltaba;
  - cliente privado → exige ID y empresa, y crea `INTERNO`;
  - placa inválida → 400.
- **Orden:** `create` y `update` guardan y sincronizan `vehicleIds`; un
  vehículo inexistente se rechaza.
- **Base esperada:** `tsc` limpio y `jest` con 15 suites y 14 pruebas fallando
  (las mismas de siempre), con más pruebas pasando. Hoy
  `clients.service.spec.ts` es uno de los archivos que ya fallan por inyección
  de dependencias: se arregla para poder probar.

**Frontend:** `typecheck` con 29 errores preexistentes y ninguno nuevo, y
`build` limpio.

## 5. Verificación manual (local)

1. **Cliente público:** crearlo y confirmar que aparecen su obra (con la razón
   social) y su proveedor (mismo RUC).
2. **Cliente privado:** crearlo y confirmar que solo aparece su obra.
3. **Orden de cliente público:** agregar dos placas con m³ usando Enter.
   Confirmar que aparecen en Vehículos como externos `TE-…` con ese
   proveedor.
4. **Orden de cliente privado:** elegir un vehículo existente y crear uno
   nuevo.
5. **Resultado de la orden:** guardar y revisar el detalle, el PDF y el
   mensaje de Telegram.
6. **Edición:** quitar un vehículo, guardar y confirmar.
7. **Orden vieja:** sigue mostrando sus placas de texto.
