-- Soporte de esponjamiento banco -> suelto (M3_A_M3): columnas nuevas
-- NULLABLE, no tocan ni invalidan ningún registro previo.

-- AlterTable
ALTER TABLE "CanteraMaterial" ADD COLUMN     "metrosCubicosSueltos" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "CanteraMaterialMovimiento" ADD COLUMN     "metrosCubicosSueltos" DOUBLE PRECISION;
