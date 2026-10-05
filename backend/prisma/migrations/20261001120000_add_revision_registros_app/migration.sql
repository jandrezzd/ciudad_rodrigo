-- AlterEnum
ALTER TYPE "PendingArrivalStatus" ADD VALUE 'DESCARTADO';

-- AlterTable
ALTER TABLE "TransportTrip" ADD COLUMN "motivoRevision" TEXT,
ADD COLUMN "posibleDuplicado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TransportArrivalPending" ALTER COLUMN "vehicleId" DROP NOT NULL,
ADD COLUMN "motivoRevision" TEXT,
ADD COLUMN "departureUuid" UUID,
ADD COLUMN "qrcode" TEXT;
