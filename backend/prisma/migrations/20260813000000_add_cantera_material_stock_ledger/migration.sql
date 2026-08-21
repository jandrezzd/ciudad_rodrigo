-- Stock de materiales por cantera + libro mayor de consumo.
-- Todas las columnas nuevas en tablas existentes son NULLABLE: la migración no
-- toca ni invalida ningún registro previo.

-- CreateEnum
CREATE TYPE "ProveedorTipo" AS ENUM ('INTERNO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "ConversionDireccion" AS ENUM ('TN_A_M3', 'M3_A_TN');

-- CreateEnum
CREATE TYPE "MovimientoTipo" AS ENUM ('SALIDA', 'AJUSTE', 'REVERSA');

-- AlterTable
ALTER TABLE "MaterialProvider" ADD COLUMN     "nombreComercial" TEXT,
ADD COLUMN     "tipo" "ProveedorTipo";

-- AlterTable
ALTER TABLE "PlanningVehicle" ADD COLUMN     "canteraId" INTEGER;

-- AlterTable
ALTER TABLE "TransportTrip" ADD COLUMN     "canteraId" INTEGER;

-- CreateTable
CREATE TABLE "CanteraMaterial" (
    "id" SERIAL NOT NULL,
    "canteraId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "toneladas" DOUBLE PRECISION,
    "metrosCubicos" DOUBLE PRECISION,
    "factor" DOUBLE PRECISION,
    "direccionConversion" "ConversionDireccion" NOT NULL DEFAULT 'TN_A_M3',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanteraMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanteraMaterialMovimiento" (
    "id" SERIAL NOT NULL,
    "canteraMaterialId" INTEGER NOT NULL,
    "tripId" INTEGER,
    "m3" DOUBLE PRECISION NOT NULL,
    "toneladas" DOUBLE PRECISION,
    "tipo" "MovimientoTipo" NOT NULL DEFAULT 'SALIDA',
    "motivo" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanteraMaterialMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanteraMaterial_canteraId_idx" ON "CanteraMaterial"("canteraId");

-- CreateIndex
CREATE INDEX "CanteraMaterial_materialId_idx" ON "CanteraMaterial"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "CanteraMaterial_canteraId_materialId_key" ON "CanteraMaterial"("canteraId", "materialId");

-- CreateIndex
-- Postgres admite varios NULL en un UNIQUE: los ajustes manuales (sin viaje)
-- conviven, y a la vez un mismo viaje no puede descontar dos veces.
CREATE UNIQUE INDEX "CanteraMaterialMovimiento_tripId_key" ON "CanteraMaterialMovimiento"("tripId");

-- CreateIndex
CREATE INDEX "CanteraMaterialMovimiento_canteraMaterialId_capturedAt_idx" ON "CanteraMaterialMovimiento"("canteraMaterialId", "capturedAt");

-- CreateIndex
CREATE INDEX "CanteraMaterialMovimiento_capturedAt_idx" ON "CanteraMaterialMovimiento"("capturedAt");

-- CreateIndex
CREATE INDEX "PlanningVehicle_canteraId_idx" ON "PlanningVehicle"("canteraId");

-- CreateIndex
CREATE INDEX "TransportTrip_canteraId_idx" ON "TransportTrip"("canteraId");

-- AddForeignKey
ALTER TABLE "PlanningVehicle" ADD CONSTRAINT "PlanningVehicle_canteraId_fkey" FOREIGN KEY ("canteraId") REFERENCES "Cantera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_canteraId_fkey" FOREIGN KEY ("canteraId") REFERENCES "Cantera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanteraMaterial" ADD CONSTRAINT "CanteraMaterial_canteraId_fkey" FOREIGN KEY ("canteraId") REFERENCES "Cantera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanteraMaterial" ADD CONSTRAINT "CanteraMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanteraMaterialMovimiento" ADD CONSTRAINT "CanteraMaterialMovimiento_canteraMaterialId_fkey" FOREIGN KEY ("canteraMaterialId") REFERENCES "CanteraMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanteraMaterialMovimiento" ADD CONSTRAINT "CanteraMaterialMovimiento_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
