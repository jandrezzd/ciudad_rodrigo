-- El comprador de una venta pasa a ser un cliente registrado, en lugar de texto
-- libre. La columna `comprador` se conserva: pasa a guardar el nombre comercial
-- del cliente al momento del despacho (una copia, como `plate` y `driverName`).
--
-- Solo agrega una columna nullable, su índice y su llave foránea. No modifica
-- ninguna columna existente, así que las ventas ya registradas quedan intactas.

-- AlterTable
ALTER TABLE "VentaCantera" ADD COLUMN     "compradorId" INTEGER;

-- CreateIndex
CREATE INDEX "VentaCantera_compradorId_idx" ON "VentaCantera"("compradorId");

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
