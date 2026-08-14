-- Conductor que hizo el viaje, capturado al registrar la salida.
-- El conductor asignado a un vehículo puede cambiar con el tiempo; sin esta
-- foto, el historial atribuiría los viajes antiguos al conductor actual.
-- Nullable: los viajes ya registrados quedan sin conductor conocido.

-- AlterTable
ALTER TABLE "TransportTrip" ADD COLUMN     "driverId" INTEGER;

-- CreateIndex
CREATE INDEX "TransportTrip_driverId_idx" ON "TransportTrip"("driverId");

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
