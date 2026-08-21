-- Llegadas que sincronizaron al servidor sin que su salida correspondiente haya
-- llegado todavía. Se resuelven después contra TransportTrip por placa + ventana
-- de tiempo (ver reconciliation/). No se borra al hacer match: matchedTripId +
-- status=EMPAREJADO quedan como bitácora auditable.

-- CreateEnum
CREATE TYPE "PendingArrivalStatus" AS ENUM ('PENDIENTE', 'EMPAREJADO', 'EXPIRADO');

-- CreateTable
CREATE TABLE "TransportArrivalPending" (
    "id" SERIAL NOT NULL,
    "clientUuid" UUID NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'ONLINE',
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "m3" DOUBLE PRECISION NOT NULL,
    "m3Corrected" DOUBLE PRECISION,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "abscisa" INTEGER,
    "almuerzo" BOOLEAN NOT NULL DEFAULT false,
    "driverPhoto" TEXT,
    "vehiclePhoto" TEXT,
    "platePhoto" TEXT,
    "materialPhoto1" TEXT,
    "materialPhoto2" TEXT,
    "status" "PendingArrivalStatus" NOT NULL DEFAULT 'PENDIENTE',
    "matchedTripId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportArrivalPending_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportArrivalPending_clientUuid_key" ON "TransportArrivalPending"("clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "TransportArrivalPending_matchedTripId_key" ON "TransportArrivalPending"("matchedTripId");

-- CreateIndex
CREATE INDEX "TransportArrivalPending_vehicleId_status_capturedAt_idx" ON "TransportArrivalPending"("vehicleId", "status", "capturedAt");

-- AddForeignKey
ALTER TABLE "TransportArrivalPending" ADD CONSTRAINT "TransportArrivalPending_matchedTripId_fkey" FOREIGN KEY ("matchedTripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportArrivalPending" ADD CONSTRAINT "TransportArrivalPending_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportArrivalPending" ADD CONSTRAINT "TransportArrivalPending_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
