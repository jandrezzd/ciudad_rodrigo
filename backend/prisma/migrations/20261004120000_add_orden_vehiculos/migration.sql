-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "brand" DROP NOT NULL,
ALTER COLUMN "model" DROP NOT NULL,
ALTER COLUMN "year" DROP NOT NULL;

-- CreateTable
CREATE TABLE "VentaOrdenVehiculo" (
    "id" SERIAL NOT NULL,
    "ordenId" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaOrdenVehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VentaOrdenVehiculo_vehicleId_idx" ON "VentaOrdenVehiculo"("vehicleId");
CREATE UNIQUE INDEX "VentaOrdenVehiculo_ordenId_vehicleId_key" ON "VentaOrdenVehiculo"("ordenId", "vehicleId");

-- AddForeignKey
ALTER TABLE "VentaOrdenVehiculo" ADD CONSTRAINT "VentaOrdenVehiculo_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "VentaOrden"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VentaOrdenVehiculo" ADD CONSTRAINT "VentaOrdenVehiculo_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
