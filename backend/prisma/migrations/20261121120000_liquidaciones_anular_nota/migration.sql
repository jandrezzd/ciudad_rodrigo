-- Liquidaciones: estado ACTIVA/ANULADA (con auditoría de la anulación) y
-- nota del liquidador por viaje, separada de las notas automáticas.
-- Ver docs/liquidaciones/README-liquidaciones-backend.md.

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('ACTIVA', 'ANULADA');

-- AlterTable
ALTER TABLE "TransportTrip" ADD COLUMN     "notaLiquidador" TEXT,
ADD COLUMN     "notaLiquidadorEn" TIMESTAMP(3),
ADD COLUMN     "notaLiquidadorPorId" INTEGER;

-- AlterTable
ALTER TABLE "Liquidacion" ADD COLUMN     "anuladaEn" TIMESTAMP(3),
ADD COLUMN     "anuladaPorId" INTEGER,
ADD COLUMN     "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'ACTIVA',
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "viajesAnulados" JSONB;

-- CreateIndex
CREATE INDEX "Liquidacion_estado_idx" ON "Liquidacion"("estado");

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_notaLiquidadorPorId_fkey" FOREIGN KEY ("notaLiquidadorPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

