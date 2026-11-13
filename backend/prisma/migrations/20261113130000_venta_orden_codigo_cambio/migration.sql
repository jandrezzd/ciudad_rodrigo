-- Historial de cambios de código de las órdenes de venta, hechos a mano por un
-- ADMIN desde la web (cambio a un código libre o intercambio entre dos órdenes).
-- Solo agrega una tabla nueva: no toca VentaOrden ni sus datos.

-- CreateTable
CREATE TABLE "VentaOrdenCodigoCambio" (
    "id" SERIAL NOT NULL,
    "ordenId" INTEGER NOT NULL,
    "codigoAnterior" TEXT NOT NULL,
    "codigoNuevo" TEXT NOT NULL,
    "intercambio" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaOrdenCodigoCambio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VentaOrdenCodigoCambio_ordenId_idx" ON "VentaOrdenCodigoCambio"("ordenId");

-- AddForeignKey
ALTER TABLE "VentaOrdenCodigoCambio" ADD CONSTRAINT "VentaOrdenCodigoCambio_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "VentaOrden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrdenCodigoCambio" ADD CONSTRAINT "VentaOrdenCodigoCambio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
