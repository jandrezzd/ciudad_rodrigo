-- Stock de ventas de cantera.
--
-- Solo crea tablas nuevas: no hay un ALTER sobre ninguna tabla existente. Las
-- relaciones inversas declaradas en Cantera, Material, User y VentaCantera son
-- campos virtuales de Prisma y no generan SQL.
--
-- Deliberadamente NO se reutiliza CanteraMaterial/CanteraMaterialMovimiento: esas
-- llevan el saldo del flujo cantera->obra, con conversiones TN<->M3 y asignación
-- por planificación. Mezclarlas haría que una planificación de transporte moviera
-- el saldo del punto de venta.

-- CreateEnum
CREATE TYPE "VentaStockTipo" AS ENUM ('INGRESO', 'SALIDA', 'AJUSTE', 'REVERSA');

-- CreateTable
CREATE TABLE "VentaCanteraStock" (
    "id" SERIAL NOT NULL,
    "canteraId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "m3Asignados" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VentaCanteraStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaStockMovimiento" (
    "id" SERIAL NOT NULL,
    "stockId" INTEGER NOT NULL,
    "ventaId" INTEGER,
    "m3" DOUBLE PRECISION NOT NULL,
    "tipo" "VentaStockTipo" NOT NULL,
    "motivo" TEXT,
    "userId" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaStockMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VentaCanteraStock_canteraId_materialId_key" ON "VentaCanteraStock"("canteraId", "materialId");

-- CreateIndex
CREATE INDEX "VentaCanteraStock_canteraId_idx" ON "VentaCanteraStock"("canteraId");

-- CreateIndex
CREATE INDEX "VentaCanteraStock_materialId_idx" ON "VentaCanteraStock"("materialId");

-- CreateIndex
-- Postgres admite varios NULL en un UNIQUE: los movimientos manuales (ingreso,
-- ajuste, reversa) conviven sin estorbarse, y a la vez una misma venta no puede
-- descontar dos veces aunque la app reenvíe el mismo uuid.
CREATE UNIQUE INDEX "VentaStockMovimiento_ventaId_key" ON "VentaStockMovimiento"("ventaId");

-- CreateIndex
CREATE INDEX "VentaStockMovimiento_stockId_capturedAt_idx" ON "VentaStockMovimiento"("stockId", "capturedAt");

-- CreateIndex
CREATE INDEX "VentaStockMovimiento_capturedAt_idx" ON "VentaStockMovimiento"("capturedAt");

-- AddForeignKey
ALTER TABLE "VentaCanteraStock" ADD CONSTRAINT "VentaCanteraStock_canteraId_fkey" FOREIGN KEY ("canteraId") REFERENCES "Cantera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCanteraStock" ADD CONSTRAINT "VentaCanteraStock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaStockMovimiento" ADD CONSTRAINT "VentaStockMovimiento_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "VentaCanteraStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL y no CASCADE: si algún día se borra físicamente una venta, el
-- movimiento tiene que seguir ahí. El material salió de la cantera igual.
ALTER TABLE "VentaStockMovimiento" ADD CONSTRAINT "VentaStockMovimiento_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "VentaCantera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaStockMovimiento" ADD CONSTRAINT "VentaStockMovimiento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
