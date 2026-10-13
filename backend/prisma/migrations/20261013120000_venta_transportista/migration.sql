-- AlterTable
ALTER TABLE "VentaCantera" ADD COLUMN "transportistaId" INTEGER;

-- CreateIndex
CREATE INDEX "VentaCantera_transportistaId_idx" ON "VentaCantera"("transportistaId");

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
