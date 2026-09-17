-- Órdenes de venta: el pedido de un cliente para una de sus obras, con sus
-- materiales comprometidos. Solo agrega tablas nuevas y columnas nullable en
-- VentaCantera — ninguna venta ni columna existente cambia de significado.

-- CreateEnum
CREATE TYPE "VentaOrdenEstado" AS ENUM ('ABIERTA', 'COMPLETADA', 'CERRADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "VentaCantera" ADD COLUMN     "constSiteId" INTEGER,
ADD COLUMN     "ordenId" INTEGER,
ADD COLUMN     "ordenItemId" INTEGER;

-- CreateTable
CREATE TABLE "VentaOrdenSequence" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VentaOrdenSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaOrden" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "constSiteId" INTEGER NOT NULL,
    "estado" "VentaOrdenEstado" NOT NULL DEFAULT 'ABIERTA',
    "observacion" TEXT,
    "fechaApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" TIMESTAMP(3),
    "cerradaPorId" INTEGER,
    "motivoCierre" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VentaOrden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaOrdenItem" (
    "id" SERIAL NOT NULL,
    "ordenId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "m3Asignados" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VentaOrdenItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VentaOrdenSequence_year_key" ON "VentaOrdenSequence"("year");

-- CreateIndex
CREATE UNIQUE INDEX "VentaOrden_codigo_key" ON "VentaOrden"("codigo");

-- CreateIndex
CREATE INDEX "VentaOrden_clientId_idx" ON "VentaOrden"("clientId");

-- CreateIndex
CREATE INDEX "VentaOrden_constSiteId_estado_idx" ON "VentaOrden"("constSiteId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "VentaOrdenItem_ordenId_materialId_key" ON "VentaOrdenItem"("ordenId", "materialId");

-- CreateIndex
CREATE INDEX "VentaCantera_ordenId_idx" ON "VentaCantera"("ordenId");

-- CreateIndex
CREATE INDEX "VentaCantera_ordenItemId_idx" ON "VentaCantera"("ordenItemId");

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "VentaOrden"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_ordenItemId_fkey" FOREIGN KEY ("ordenItemId") REFERENCES "VentaOrdenItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCantera" ADD CONSTRAINT "VentaCantera_constSiteId_fkey" FOREIGN KEY ("constSiteId") REFERENCES "ConstSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrden" ADD CONSTRAINT "VentaOrden_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrden" ADD CONSTRAINT "VentaOrden_constSiteId_fkey" FOREIGN KEY ("constSiteId") REFERENCES "ConstSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrden" ADD CONSTRAINT "VentaOrden_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrdenItem" ADD CONSTRAINT "VentaOrdenItem_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "VentaOrden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaOrdenItem" ADD CONSTRAINT "VentaOrdenItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
