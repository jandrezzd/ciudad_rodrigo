-- CreateTable
CREATE TABLE "Transportista" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transportista_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "VentaOrden" ADD COLUMN "transportistaId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Transportista_name_key" ON "Transportista"("name");
CREATE INDEX "VentaOrden_transportistaId_idx" ON "VentaOrden"("transportistaId");

-- AddForeignKey
ALTER TABLE "VentaOrden" ADD CONSTRAINT "VentaOrden_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
