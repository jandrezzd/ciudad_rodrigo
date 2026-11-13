-- Consumo manual de una línea de orden de venta: m³ ya consumidos que no se
-- registraron como venta desde la app. Lo registra un ADMIN desde la web.
-- No es una venta y no toca el stock de canteras. Solo agrega una tabla nueva.

-- CreateTable
CREATE TABLE "VentaOrdenConsumoManual" (
    "id" SERIAL NOT NULL,
    "ordenId" INTEGER NOT NULL,
    "ordenItemId" INTEGER NOT NULL,
    "m3" DOUBLE PRECISION NOT NULL,
    "viajes" INTEGER,
    "motivo" TEXT NOT NULL,
    "registradoPorId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "anuladoPorId" INTEGER,
    "anuladoEn" TIMESTAMP(3),
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VentaOrdenConsumoManual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VentaOrdenConsumoManual_ordenItemId_isActive_idx" ON "VentaOrdenConsumoManual"("ordenItemId", "isActive");

-- CreateIndex
CREATE INDEX "VentaOrdenConsumoManual_ordenId_idx" ON "VentaOrdenConsumoManual"("ordenId");

-- AddForeignKey
ALTER TABLE "VentaOrdenConsumoManual" ADD CONSTRAINT "VentaOrdenConsumoManual_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "VentaOrden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrdenConsumoManual" ADD CONSTRAINT "VentaOrdenConsumoManual_ordenItemId_fkey" FOREIGN KEY ("ordenItemId") REFERENCES "VentaOrdenItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrdenConsumoManual" ADD CONSTRAINT "VentaOrdenConsumoManual_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrdenConsumoManual" ADD CONSTRAINT "VentaOrdenConsumoManual_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
