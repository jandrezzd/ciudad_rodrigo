-- Choferes: cargo, tipo (interno/externo) y vínculo con el proveedor (Owner).
--
-- El listado de la empresa (prisma/data/choferes-internos.json) trae cédula y
-- cargo de 65 choferes internos; en producción ya hay 16 registrados, 15 de
-- ellos sin cédula. Esta migración solo abre el espacio para esos datos: el
-- relleno lo hace el seed, que es re-ejecutable.

-- CreateEnum
CREATE TYPE "DriverTipo" AS ENUM ('INTERNO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "DriverCargo" AS ENUM ('CHOFER_DE_VOLQUETA', 'CHOFER_CAMION', 'CHOFER_DE_FURGONETA', 'CHOFER_DE_CAMIONCITO', 'CHOFER_TANQUERO');

-- name pasa a obligatorio. Antes hay que limpiar lo que ya está guardado:
-- el chofer " Walter Almeida" (id 14) tiene un espacio al inicio del nombre,
-- y un nombre vacío no puede quedar como '' bajo un NOT NULL que se supone
-- que garantiza que el chofer es identificable.
UPDATE "Driver" SET "name" = btrim("name") WHERE "name" IS NOT NULL;
UPDATE "Driver" SET "name" = 'SIN NOMBRE' WHERE "name" IS NULL OR "name" = '';
ALTER TABLE "Driver" ALTER COLUMN "name" SET NOT NULL;

-- document pasa a @unique. Un '' se comporta como valor real y chocaría con
-- cualquier otro chofer sin cédula, así que se normaliza a NULL (Postgres
-- permite tantos NULL como haga falta en un índice único).
UPDATE "Driver" SET "document" = btrim("document") WHERE "document" IS NOT NULL;
UPDATE "Driver" SET "document" = NULL WHERE "document" = '';

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN "cargo" "DriverCargo";
ALTER TABLE "Driver" ADD COLUMN "tipo" "DriverTipo" NOT NULL DEFAULT 'INTERNO';
ALTER TABLE "Driver" ADD COLUMN "ownerId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Driver_document_key" ON "Driver"("document");

-- CreateIndex
CREATE INDEX "Driver_ownerId_idx" ON "Driver"("ownerId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
