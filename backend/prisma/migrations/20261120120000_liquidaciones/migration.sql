-- Liquidaciones de viajes: liquidación (obra + cliente + viajes con precio),
-- historial de ediciones y secuencia del código LIQ-0001-YYYY.
-- Ver docs/liquidaciones/README-liquidaciones-backend.md.

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "constSiteId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "montoTotal" DECIMAL(12,2) NOT NULL,
    "observacion" TEXT,
    "creadoPorId" INTEGER NOT NULL,
    "editadoPorId" INTEGER,
    "editadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionViaje" (
    "id" SERIAL NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "tripId" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "LiquidacionViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionEdicion" (
    "id" SERIAL NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "userId" INTEGER,
    "motivo" TEXT NOT NULL,
    "cambios" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidacionEdicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionSequence" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LiquidacionSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Liquidacion_codigo_key" ON "Liquidacion"("codigo");

-- CreateIndex
CREATE INDEX "Liquidacion_constSiteId_idx" ON "Liquidacion"("constSiteId");

-- CreateIndex
CREATE INDEX "Liquidacion_fecha_idx" ON "Liquidacion"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacionViaje_tripId_key" ON "LiquidacionViaje"("tripId");

-- CreateIndex
CREATE INDEX "LiquidacionViaje_liquidacionId_idx" ON "LiquidacionViaje"("liquidacionId");

-- CreateIndex
CREATE INDEX "LiquidacionEdicion_liquidacionId_idx" ON "LiquidacionEdicion"("liquidacionId");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacionSequence_year_key" ON "LiquidacionSequence"("year");

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_constSiteId_fkey" FOREIGN KEY ("constSiteId") REFERENCES "ConstSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionViaje" ADD CONSTRAINT "LiquidacionViaje_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionViaje" ADD CONSTRAINT "LiquidacionViaje_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionEdicion" ADD CONSTRAINT "LiquidacionEdicion_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionEdicion" ADD CONSTRAINT "LiquidacionEdicion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Módulo de permisos "Liquidaciones" (pantalla de Roles y permisos).
INSERT INTO "Modulo" ("key", "label") VALUES ('liquidaciones', 'Liquidaciones')
ON CONFLICT ("key") DO NOTHING;

-- ADMIN: todo.
INSERT INTO "RolePermission" ("roleId", "moduloId", "canView", "canCreate", "canEdit", "canDelete", "canToggle")
SELECT r.id, m.id, true, true, true, true, true
FROM "Role" r CROSS JOIN "Modulo" m
WHERE r.name = 'ADMIN' AND m.key = 'liquidaciones'
ON CONFLICT ("roleId", "moduloId") DO NOTHING;

-- JEFE_DE_OBRA: ver, crear y editar.
INSERT INTO "RolePermission" ("roleId", "moduloId", "canView", "canCreate", "canEdit", "canDelete", "canToggle")
SELECT r.id, m.id, true, true, true, false, false
FROM "Role" r CROSS JOIN "Modulo" m
WHERE r.name = 'JEFE_DE_OBRA' AND m.key = 'liquidaciones'
ON CONFLICT ("roleId", "moduloId") DO NOTHING;
