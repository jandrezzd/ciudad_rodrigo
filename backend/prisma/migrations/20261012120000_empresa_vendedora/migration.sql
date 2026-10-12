-- CreateEnum
CREATE TYPE "EmpresaVendedora" AS ENUM ('CIUDAD_RODRIGO', 'DISTRASA', 'TRANSLOGPACIFIC');

-- AlterTable
ALTER TABLE "VentaOrden" ADD COLUMN "empresaVendedora" "EmpresaVendedora";
