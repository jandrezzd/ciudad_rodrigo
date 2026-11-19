-- AlterTable
ALTER TABLE "Planning" ADD COLUMN "ubicacionLlegadaLat" DOUBLE PRECISION,
ADD COLUMN "ubicacionLlegadaLng" DOUBLE PRECISION,
ADD COLUMN "radioLlegadaM" INTEGER NOT NULL DEFAULT 300;

-- AlterTable
ALTER TABLE "TransportArrival" ADD COLUMN "gpsPrecisionM" DOUBLE PRECISION,
ADD COLUMN "fotosGps" JSONB,
ADD COLUMN "ubicacionLat" DOUBLE PRECISION,
ADD COLUMN "ubicacionLng" DOUBLE PRECISION,
ADD COLUMN "ubicacionPrecisionM" DOUBLE PRECISION,
ADD COLUMN "ubicacionDistanciaRefM" DOUBLE PRECISION,
ADD COLUMN "ubicacionDentroRadio" BOOLEAN,
ADD COLUMN "ubicacionDetalle" JSONB,
ADD COLUMN "ubicacionCalculadaEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TransportArrivalPending" ADD COLUMN "gpsPrecisionM" DOUBLE PRECISION,
ADD COLUMN "fotosGps" JSONB;
