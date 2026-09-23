-- Roles y permisos por módulo.
--
-- El cargo del usuario pasa de un enum fijo (Role) a una tabla con nombre
-- libre, con una matriz de permisos por módulo (Ver/Crear/Editar/Eliminar/
-- Activar-Desactivar). Verificado a mano contra `prisma migrate diff` y
-- reordenado: no se puede crear la tabla "Role" mientras el enum "Role"
-- siga existiendo (Postgres no permite dos tipos con el mismo nombre en el
-- mismo schema), así que primero se renombra el enum viejo, se crean las
-- tablas nuevas y se migran los datos, y recién al final se borra el enum.

-- ─── 1. Liberar el nombre "Role" ────────────────────────────────────────────
ALTER TYPE "Role" RENAME TO "Role_legacy_enum";

-- ─── 2. Tablas nuevas ────────────────────────────────────────────────────────
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

CREATE TABLE "Modulo" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "Modulo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Modulo_key_key" ON "Modulo"("key");

CREATE TABLE "RolePermission" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "moduloId" INTEGER NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canToggle" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RolePermission_roleId_moduloId_key" ON "RolePermission"("roleId", "moduloId");
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 3. Sembrar roles: los 4 que ya existían (isSystem) + TRABAJADOR ────────
INSERT INTO "Role" ("name", "description", "isSystem", "isActive", "updatedAt") VALUES
  ('ADMIN', 'Acceso total al sistema', true, true, CURRENT_TIMESTAMP),
  ('SUPERVISOR', 'Registra despachos desde la app móvil', true, true, CURRENT_TIMESTAMP),
  ('JEFE_DE_OBRA', 'Supervisión de obra', true, true, CURRENT_TIMESTAMP),
  ('PLANIFICADOR', 'Planificación de transporte', true, true, CURRENT_TIMESTAMP),
  ('TRABAJADOR', 'Cargo con permisos configurables desde Roles y permisos', false, true, CURRENT_TIMESTAMP);

-- ─── 4. Sembrar el catálogo de módulos ──────────────────────────────────────
INSERT INTO "Modulo" ("key", "label") VALUES
  ('dashboard', 'Dashboard'),
  ('vehicles', 'Vehículos'),
  ('owners', 'Proveedores'),
  ('material-providers', 'Prov. Material'),
  ('const-sites', 'Obras'),
  ('plannings', 'Planificación'),
  ('clients', 'Clientes'),
  ('drivers', 'Choferes'),
  ('transport-log', 'Registro Transporte'),
  ('ventas', 'Venta de material'),
  ('ventas-ordenes', 'Órdenes de venta'),
  ('reports', 'Reportes'),
  ('users', 'Usuarios'),
  ('roles', 'Roles y permisos');

-- ─── 5. Sembrar permisos: replican el acceso que cada rol ya tenía hoy ─────
-- ADMIN: todo, en todos los módulos (el guard además lo hardcodea aparte,
-- pero se siembra igual para que la pantalla de permisos lo muestre marcado).
INSERT INTO "RolePermission" ("roleId", "moduloId", "canView", "canCreate", "canEdit", "canDelete", "canToggle")
SELECT r.id, m.id, true, true, true, true, true
FROM "Role" r CROSS JOIN "Modulo" m
WHERE r.name = 'ADMIN';

-- JEFE_DE_OBRA: lo que ya podía ver en AppRouter.tsx (ALL_WEB_ROLES +
-- registro-transporte-jefe + reportes). Antes de este cambio, dentro de esas
-- pantallas no había ninguna restricción de acción (solo de a qué pantalla
-- entraba) — así que se siembra con create+edit también, para no perderle
-- capacidad que ya tenía el día del despliegue.
INSERT INTO "RolePermission" ("roleId", "moduloId", "canView", "canCreate", "canEdit", "canDelete", "canToggle")
SELECT r.id, m.id, true, true, true, false, false
FROM "Role" r CROSS JOIN "Modulo" m
WHERE r.name = 'JEFE_DE_OBRA'
  AND m.key IN ('vehicles', 'owners', 'material-providers', 'transport-log', 'reports');

-- SUPERVISOR: sin pantallas web (es exclusivo de la app móvil), pero SÍ
-- necesita 'transport-log' (registrar salida/llegada) y 'ventas'/
-- 'ventas-ordenes' (despachar venta de material) — son los módulos que la
-- app móvil llama. Sin esto, el guard nuevo le rompería la app: antes de
-- este cambio no existía ningún chequeo de rol y podía llamar a cualquier
-- endpoint.
INSERT INTO "RolePermission" ("roleId", "moduloId", "canView", "canCreate", "canEdit", "canDelete", "canToggle")
SELECT r.id, m.id, true, true, true, false, false
FROM "Role" r CROSS JOIN "Modulo" m
WHERE r.name = 'SUPERVISOR' AND m.key = 'transport-log';

INSERT INTO "RolePermission" ("roleId", "moduloId", "canView", "canCreate", "canEdit", "canDelete", "canToggle")
SELECT r.id, m.id, true, true, false, false, false
FROM "Role" r CROSS JOIN "Modulo" m
WHERE r.name = 'SUPERVISOR' AND m.key IN ('ventas', 'ventas-ordenes');

-- PLANIFICADOR: no aparecía en ningún array de AppRouter.tsx — sin filas.
-- TRABAJADOR: recién creado, el ADMIN lo configura desde /roles — sin filas.

-- ─── 6. Migrar User.role (enum) -> User.roleId (FK) ─────────────────────────
ALTER TABLE "User" ADD COLUMN "roleId" INTEGER;

UPDATE "User" u
SET "roleId" = r.id
FROM "Role" r
WHERE r.name = u."role"::text;

ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" DROP COLUMN "role";

-- ─── 7. Borrar el enum viejo, ya sin ninguna columna que lo use ─────────────
DROP TYPE "Role_legacy_enum";
